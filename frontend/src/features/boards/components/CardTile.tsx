import { memo, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, Flame, ListChecks, MessageSquare, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DueBadge } from '@/shared/components/DueBadge'
import { LabelBadge } from '@/shared/components/LabelBadge'
import { UserAvatar } from '@/shared/components/UserAvatar'
import { cn } from '@/shared/lib/utils'
import type { BoardCard } from '@/shared/types/api'
import type { BoardLookups } from '../model'

/**
 * Фасад карточки на доске: номер, тип (цвет рамки), метки, название, «Срочно», срок с подсветкой,
 * прогресс чек-листов, число комментариев и файлов, ответственный. Заблокированная карточка —
 * красная рамка, фон и значок. Компактно и без всплывающих
 * компонентов — на доске сотни карточек.
 */
export const CardTileView = memo(function CardTileView({
  card,
  lookups,
  className,
}: {
  card: BoardCard
  lookups: BoardLookups
  className?: string
}) {
  const { t } = useTranslation('boards')
  const type = lookups.types.get(card.card_type_id)
  const responsible = card.responsible_id ? lookups.people.get(card.responsible_id) : undefined
  const hasDue = card.due_date !== null || card.due_at !== null
  const hasCounters =
    card.checklist !== null || card.comments_count > 0 || card.attachments_count > 0
  const hasFooter = hasDue || card.is_urgent || responsible || hasCounters

  return (
    <div
      className={cn(
        'bg-card rounded-md border border-l-4 px-3 py-2 text-left text-sm shadow-xs',
        card.is_urgent && 'ring-1 ring-red-300',
        card.is_blocked &&
          'border-red-400 bg-red-50 ring-1 ring-red-400 dark:border-red-800 dark:bg-red-950/40',
        className,
      )}
      style={{ borderLeftColor: type?.color }}
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="font-mono">{card.key}</span>
          {card.is_blocked && (
            <span
              className="inline-flex items-center gap-0.5 font-medium text-red-700 dark:text-red-400"
              title={t('facade.blocked')}
            >
              <Ban className="size-3" aria-hidden />
              {t('facade.blocked')}
            </span>
          )}
        </span>
        {type && <span className="truncate">{type.name}</span>}
      </div>
      {card.label_ids.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {card.label_ids.map((id) => {
            const label = lookups.labels.get(id)
            return label && <LabelBadge key={id} name={label.name} color={label.color} compact />
          })}
        </div>
      )}
      <div className="mt-1 line-clamp-3 break-words">{card.title}</div>
      {hasFooter && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {card.is_urgent && (
            <span
              className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700"
              title={t('facade.urgent')}
            >
              <Flame className="size-3" aria-hidden />
              {t('facade.urgent')}
            </span>
          )}
          {hasDue && <DueBadge card={card} now={lookups.now} timeZone={lookups.timeZone} />}
          {card.checklist && (
            <Counter
              icon={<ListChecks />}
              value={`${card.checklist.done}/${card.checklist.total}`}
              label={t('facade.checklist', card.checklist)}
              done={card.checklist.done === card.checklist.total}
            />
          )}
          {card.comments_count > 0 && (
            <Counter
              icon={<MessageSquare />}
              value={card.comments_count}
              label={t('facade.comments', { count: card.comments_count })}
            />
          )}
          {card.attachments_count > 0 && (
            <Counter
              icon={<Paperclip />}
              value={card.attachments_count}
              label={t('facade.attachments', { count: card.attachments_count })}
            />
          )}
          {responsible && (
            <UserAvatar
              id={responsible.id}
              name={responsible.name}
              label={t('facade.responsible', { name: responsible.name })}
              size="xs"
              className="ml-auto"
            />
          )}
        </div>
      )}
    </div>
  )
})

/** Счётчик на фасаде: иконка и число; подпись — для подсказки и скринридера. */
function Counter({
  icon,
  value,
  label,
  done = false,
}: {
  icon: ReactNode
  value: ReactNode
  label: string
  done?: boolean
}) {
  return (
    <span
      title={label}
      className={cn(
        'text-muted-foreground inline-flex items-center gap-0.5 text-xs [&_svg]:size-3',
        done && 'text-emerald-700',
      )}
    >
      {icon}
      <span aria-hidden>{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Карточка, которую можно перетаскивать. Клик или Enter открывает её (Enter не занят под
 * перетаскивание с клавиатуры — там используется пробел).
 */
export const SortableCardTile = memo(function SortableCardTile({
  card,
  lookups,
  draggable,
  onOpen,
}: {
  card: BoardCard
  lookups: BoardLookups
  draggable: boolean
  onOpen: (key: string) => void
}) {
  const { t } = useTranslation('boards')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={t('card.open', { key: card.key, title: card.title })}
      className={cn(
        'focus-visible:ring-ring rounded-md outline-none focus-visible:ring-2',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
      onClick={() => onOpen(card.key)}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event)
        if (event.key === 'Enter' && !isDragging) {
          // Нажатие использовано: иначе его продолжение (keypress) получит кнопка «Закрыть» окна карточки, куда
          // уже перешёл фокус, — окно тут же закроется (доска под окном теперь не исчезает на время загрузки)
          event.preventDefault()
          onOpen(card.key)
        }
      }}
    >
      <CardTileView card={card} lookups={lookups} />
    </div>
  )
})
