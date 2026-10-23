import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { eventTypeKey } from '@/features/admin/eventTypes'
import { formatDateTime } from '@/shared/lib/dates'
import type { CardHistory as History, CardHistoryItem, CardTransition } from '@/shared/types/api'
import { useCardHistory } from '../queries'

type T = ReturnType<typeof useTranslation<'boards'>>['t']
type TAdmin = ReturnType<typeof useTranslation<'admin'>>['t']
type EventItem = Extract<CardHistoryItem, { kind: 'event' }>
type Refs = History['refs']

function describeTransition(transition: CardTransition, t: T) {
  if (transition.reason === 'created') {
    return t('history.created', { column: transition.to_column.name })
  }
  const boardChanged = transition.from_board?.id !== transition.to_board.id
  const laneChanged = transition.from_lane?.id !== transition.to_lane.id
  const place = (board?: string, column?: string, lane?: string) =>
    [boardChanged ? board : null, column, laneChanged ? lane : null].filter(Boolean).join(' / ')

  return t('history.moved', {
    from: place(
      transition.from_board?.name,
      transition.from_column?.name,
      transition.from_lane?.name,
    ),
    to: place(transition.to_board.name, transition.to_column.name, transition.to_lane.name),
  })
}

/** Значение поля из журнала (там только id и простые значения) — по справочникам ленты. */
function fieldValue(field: string, value: unknown, refs: Refs, t: T, timeZone?: string): string {
  if (value === null || value === undefined) return '—'
  switch (field) {
    case 'customer_id':
    case 'responsible_id':
      return refs.users[String(value)] ?? t('history.unknown')
    case 'card_type_id':
      return refs.card_types[String(value)] ?? t('history.unknown')
    case 'due_date':
      return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(String(value)),
      )
    case 'due_at':
      return formatDateTime(String(value), timeZone)
    case 'is_urgent':
      return value ? t('history.yes') : t('history.no')
    case 'estimate_hours':
      // Часы — уже в названии поля «План, ч»
      return String(value).replace('.', ',')
    default:
      return String(value)
  }
}

/** Связанная карточка из payload: номер и название, «Удалённая карточка» или «Скрытая карточка». */
function cardRef(id: unknown, refs: Refs, t: T): string {
  if (id === 'deleted') return t('relations.deleted')
  const card = typeof id === 'string' ? refs.cards[id] : undefined
  return card ? `${card.key} «${card.title}»` : t('relations.hidden')
}

/** Строки описания события: для полей — «было → стало», для остального — подпись типа события. */
function describeEvent(
  item: EventItem,
  refs: Refs,
  t: T,
  tAdmin: TAdmin,
  timeZone?: string,
): string[] {
  const p = item.payload
  const via = p.via === 'auto_assign' ? ` ${t('history.viaAutoAssign')}` : ''
  switch (item.event_type) {
    case 'card.updated': {
      const changes = (p.changes ?? {}) as Record<string, { from: unknown; to: unknown }>
      return ((p.fields as string[] | undefined) ?? []).map((field) => {
        const name = t(`history.fields.${field}`, { defaultValue: field })
        const change = changes[field]
        return change
          ? `${name}: ${fieldValue(field, change.from, refs, t, timeZone)} → ${fieldValue(field, change.to, refs, t, timeZone)}${via}`
          : t('history.fieldChanged', { field: name })
      })
    }
    case 'card.participant_added':
    case 'card.participant_removed': {
      const name = refs.users[String(p.user_id)] ?? t('history.unknown')
      const key =
        item.event_type === 'card.participant_added' ? 'participantAdded' : 'participantRemoved'
      return [
        t(`history.${key}`, { name }) +
          (p.via === 'keep_access' ? ` ${t('history.viaKeepAccess')}` : via),
      ]
    }
    case 'card.labels_changed': {
      const names = (ids: unknown) =>
        ((ids as string[] | undefined) ?? []).map((id) => refs.labels[id]?.name ?? '?').join(', ')
      return [
        names(p.added) && t('history.labelsAdded', { names: names(p.added) }),
        names(p.removed) && t('history.labelsRemoved', { names: names(p.removed) }),
      ].filter(Boolean) as string[]
    }
    case 'card.relation_added':
    case 'card.relation_removed': {
      const parent = p.kind === 'parent'
      const key =
        item.event_type === 'card.relation_added'
          ? parent
            ? 'history.relation_added_parent'
            : 'history.relation_added_child'
          : parent
            ? 'history.relation_removed_parent'
            : 'history.relation_removed_child'
      return [t(key, { card: cardRef(p.card_id, refs, t) })]
    }
    case 'card.blocked': {
      const reason = refs.blocks[String(p.block_id)]
      return [
        t('history.blocked'),
        ...(p.blocking_card_id
          ? [t('history.blockedBy', { card: cardRef(p.blocking_card_id, refs, t) })]
          : []),
        ...(reason ? [reason] : []),
      ]
    }
    case 'card.unblocked':
      if (p.end_reason === 'blocker_completed') {
        return [t('history.unblockedAuto', { card: cardRef(p.blocking_card_id, refs, t) })]
      }
      return [
        p.end_reason === 'blocker_deleted' ? t('history.unblockedDeleted') : t('history.unblocked'),
      ]
    default:
      return [tAdmin(eventTypeKey(item.event_type) as never, { defaultValue: item.event_type })]
  }
}

/**
 * Лента истории карточки (вкладка «История» окна): перемещения (card_transitions) и изменения (журнал событий) —
 * новые сверху. Грузится, когда вкладку открыли. Карточки, которых зритель не видит, сервер уже заменил на «Скрытая
 * карточка».
 */
export function CardHistory({ cardKey }: { cardKey: string }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { t: tAdmin } = useTranslation('admin')
  const { data: me } = useCurrentUser()
  const history = useCardHistory(cardKey)
  const refs = history.data?.refs

  if (history.isPending)
    return <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
  if (history.isError) return <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>

  return (
    <ol className="grid gap-2" aria-label={t('history.title')}>
      {refs &&
        history.data?.data.map((item) => {
          const lines =
            item.kind === 'transition'
              ? [describeTransition(item.transition, t)]
              : describeEvent(item, refs, t, tAdmin, me?.timezone)
          const actor = item.kind === 'transition' ? item.transition.actor : item.actor
          return (
            <li key={item.id} className="border-l-2 pl-3 text-sm">
              {lines.map((line, index) => (
                <div key={index} className="break-words">
                  {line}
                </div>
              ))}
              <div className="text-muted-foreground text-xs">
                {formatDateTime(item.at, me?.timezone)} · {actor?.name ?? t('history.system')}
                {item.kind === 'transition' && (
                  <>
                    {' · '}
                    {t(`categories.${item.transition.to_category}`)}
                    {item.transition.reason !== 'manual' &&
                      item.transition.reason !== 'created' &&
                      ` · ${t(`history.reasons.${item.transition.reason}`)}`}
                  </>
                )}
              </div>
            </li>
          )
        })}
    </ol>
  )
}
