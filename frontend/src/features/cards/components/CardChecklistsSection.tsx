import { useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { neighboursAt } from '@/features/boards/model'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail, Checklist, ChecklistItem } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { checklistApi } from '../api'
import { useCardContentMutation } from '../queries'

type Action =
  | { kind: 'add'; title: string }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'remove'; id: string }
  | { kind: 'addItem'; checklistId: string; text: string }
  | { kind: 'updateItem'; id: string; text?: string; is_done?: boolean }
  | { kind: 'moveItem'; id: string; after_id: string | null; before_id: string | null }
  | { kind: 'removeItem'; id: string }

/**
 * Чек-листы: несколько на карточку, пункты с отметкой, правкой, перестановкой (перетаскивание
 * или Alt+↑/↓) и удалением. Меняют editor и admin; прогресс виден на фасаде карточки.
 */
export function CardChecklistsSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [title, setTitle] = useState('')
  const mutate = useCardContentMutation((action: Action) => {
    switch (action.kind) {
      case 'add':
        return checklistApi.add(card.key, action.title)
      case 'rename':
        return checklistApi.rename(action.id, action.title)
      case 'remove':
        return checklistApi.remove(action.id)
      case 'addItem':
        return checklistApi.addItem(action.checklistId, action.text)
      case 'updateItem':
        return checklistApi.updateItem(action.id, { text: action.text, is_done: action.is_done })
      case 'moveItem':
        return checklistApi.moveItem(action.id, {
          after_id: action.after_id,
          before_id: action.before_id,
        })
      case 'removeItem':
        return checklistApi.removeItem(action.id)
    }
  })

  const run = async (action: Action) => {
    try {
      await mutate.mutateAsync(action)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
      return false
    }
  }

  return (
    <div className="grid gap-4">
      {card.checklists.length === 0 && !canEdit && (
        <span className="text-muted-foreground text-sm">{t('checklists.none')}</span>
      )}
      {card.checklists.map((checklist) => (
        <ChecklistBlock key={checklist.id} checklist={checklist} canEdit={canEdit} run={run} />
      ))}
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (title.trim() && (await run({ kind: 'add', title: title.trim() }))) setTitle('')
          }}
        >
          <Input
            aria-label={t('checklists.newTitle')}
            placeholder={t('checklists.newTitle')}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!title.trim() || mutate.isPending}>
            <Plus />
            {t('checklists.add')}
          </Button>
        </form>
      )}
    </div>
  )
}

function ChecklistBlock({
  checklist,
  canEdit,
  run,
}: {
  checklist: Checklist
  canEdit: boolean
  run: (action: Action) => Promise<boolean>
}) {
  const { t } = useTranslation('boards')
  const [text, setText] = useState('')
  const [order, setOrder] = useState(checklist.items)
  // Сервер прислал новый порядок — показываем его (паттерн «подстройка состояния при рендере»)
  const [synced, setSynced] = useState(checklist.items)
  if (synced !== checklist.items) {
    setSynced(checklist.items)
    setOrder(checklist.items)
  }
  const done = checklist.items.filter((item) => item.is_done).length
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const move = (id: string, to: number) => {
    const from = order.findIndex((item) => item.id === id)
    if (from < 0 || to < 0 || to >= order.length || from === to) return
    const next = arrayMove(order, from, to)
    setOrder(next)
    const ids = next.map((item) => item.id)
    void run({ kind: 'moveItem', id, ...neighboursAt(ids, to) })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      move(
        String(active.id),
        order.findIndex((i) => i.id === over.id),
      )
  }

  return (
    <section className="grid gap-2" aria-label={checklist.title}>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <EditableText
            value={checklist.title}
            label={t('checklists.rename')}
            className="font-medium"
            onSave={(title) => run({ kind: 'rename', id: checklist.id, title })}
          />
        ) : (
          <span className="font-medium">{checklist.title}</span>
        )}
        <span
          className="text-muted-foreground text-xs"
          aria-label={t('checklists.progress', { done, total: checklist.items.length })}
        >
          {done}/{checklist.items.length}
        </span>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7"
            aria-label={t('checklists.remove', { title: checklist.title })}
            onClick={() => run({ kind: 'remove', id: checklist.id })}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {checklist.items.length > 0 && (
        <div className="bg-muted h-1 overflow-hidden rounded" aria-hidden>
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${(done / checklist.items.length) * 100}%` }}
          />
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={order.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="grid gap-1">
            {order.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                canEdit={canEdit}
                run={run}
                onMove={(delta) => move(item.id, index + delta)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (
              text.trim() &&
              (await run({ kind: 'addItem', checklistId: checklist.id, text: text.trim() }))
            ) {
              setText('')
            }
          }}
        >
          <Input
            aria-label={t('checklists.newItem', { title: checklist.title })}
            placeholder={t('checklists.newItemPlaceholder')}
            value={text}
            maxLength={1000}
            className="h-8"
            onChange={(event) => setText(event.target.value)}
          />
        </form>
      )}
    </section>
  )
}

function ItemRow({
  item,
  canEdit,
  run,
  onMove,
}: {
  item: ChecklistItem
  canEdit: boolean
  run: (action: Action) => Promise<boolean>
  onMove: (delta: number) => void
}) {
  const { t } = useTranslation('boards')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex items-start gap-2 rounded px-1 py-0.5 ${isDragging ? 'bg-muted opacity-60' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          className="text-muted-foreground mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={t('checklists.drag', { text: item.text })}
          {...attributes}
          {...listeners}
          onKeyDown={(event) => {
            // Alt+↑/↓ — переставить без перетаскивания
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
              event.preventDefault()
              onMove(event.key === 'ArrowUp' ? -1 : 1)
              return
            }
            listeners?.onKeyDown?.(event)
          }}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <Checkbox
        className="mt-0.5"
        checked={item.is_done}
        disabled={!canEdit}
        aria-label={item.text}
        onCheckedChange={(checked) =>
          run({ kind: 'updateItem', id: item.id, is_done: checked === true })
        }
      />
      {canEdit ? (
        <EditableText
          value={item.text}
          label={t('checklists.editItem')}
          className={item.is_done ? 'text-muted-foreground line-through' : ''}
          onSave={(text) => run({ kind: 'updateItem', id: item.id, text })}
        />
      ) : (
        <span className={`text-sm ${item.is_done ? 'text-muted-foreground line-through' : ''}`}>
          {item.text}
        </span>
      )}
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={t('checklists.removeItem', { text: item.text })}
          onClick={() => run({ kind: 'removeItem', id: item.id })}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

/** Текст, который по клику становится полем ввода; Enter или уход фокуса — сохранить, Esc — отмена. */
function EditableText({
  value,
  label,
  className,
  onSave,
}: {
  value: string
  label: string
  className?: string
  onSave: (value: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return (
      <button
        type="button"
        className={`min-w-0 flex-1 text-left text-sm break-words ${className ?? ''}`}
        aria-label={`${label}: ${value}`}
        onClick={() => setDraft(value)}
      >
        {value}
      </button>
    )
  }

  const commit = async () => {
    const next = draft.trim()
    if (next && next !== value) await onSave(next)
    setDraft(null)
  }

  return (
    <Input
      aria-label={label}
      value={draft}
      autoFocus
      className="h-7 flex-1"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(null)
      }}
    />
  )
}
