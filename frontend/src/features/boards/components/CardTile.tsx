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
        // Тень — только в светлой теме: на тёмной её не видно, карточку отделяют тон и рамка (наведение — рамка светлее).
        // Тень при наведении — и у заблокированной (решение PM 27.10, U-7 «Редизайна»); рамку наведения в тёмной теме
        // ей не даём — у неё своя, красная
        'bg-card rounded-md border border-l-4 px-3 py-2 text-left text-sm shadow-xs dark:shadow-none',
        'hover:shadow-sm dark:hover:shadow-none',
        !card.is_blocked && 'dark:hover:border-input/50',
        card.is_urgent && 'ring-danger-outline/50 ring-1',
        card.is_blocked && 'border-danger-outline bg-danger-surface ring-danger-outline ring-1',
        className,
      )}
      style={{ borderLeftColor: type?.color }}
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="tabular-nums">{card.key}</span>
          {card.is_blocked && (
            <span
              className="text-danger inline-flex items-center gap-0.5 font-medium"
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
        // Переносится: у карточки со сроком, «Срочно» и счётчиками аватар иначе выходил за край
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {card.is_urgent && (
            <span
              className="text-danger inline-flex items-center gap-0.5 text-xs font-medium"
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
        done && 'text-success',
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
 * перетаскивание с клавиатуры — там используется пробел). Без права переноса — просто кнопка, которая открывает
 * карточку: атрибуты dnd-kit (aria-disabled, инструкция переноса для диктора) ей не нужны — диктор объявлял её
 * «недоступной», хотя она открывается (LATER-76).
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
      {...(draggable ? attributes : undefined)}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={t('card.open', { key: card.key, title: card.title })}
      data-card-tile={card.key}
      className={cn(
        'rounded-md',
        draggable && 'cursor-grab active:cursor-grabbing',
        // Место, куда упадёт карточка, — пунктирная рамка её размера (на белой доске без серых ячеек полупрозрачная
        // карточка терялась); outline, а не border, — размер не меняется. Пунктир занимает outline, поэтому фокус при
        // переносе с клавиатуры — кольцом цвета ring
        isDragging &&
          'bg-muted-foreground/10 outline-muted-foreground/50 focus-visible:ring-ring outline-2 -outline-offset-2 outline-dashed focus-visible:ring-2 [&>*]:invisible',
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
