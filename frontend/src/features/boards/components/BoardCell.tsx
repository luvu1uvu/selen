import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/shared/lib/utils'
import type { BoardCard, Lane } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import type { BoardLookups } from '../model'
import { AddCardForm } from './AddCardForm'
import { SortableCardTile } from './CardTile'

/** Форма «+» из заголовка колонки (LATER-44): открыта в ячейке первой дорожки, карточка — в начало. */
export interface TopCardForm {
  lanes: Lane[]
  cellCardIds: (laneId: string) => string[]
  onClose: () => void
}

/**
 * Ячейка доски (листовая колонка × дорожка): список карточек и добавление новой.
 *
 * «+ Карточка» (LATER-44, как в Kaiten): в ячейке с карточками скрыта и появляется при наведении на пустую
 * область под последней карточкой (не меньше 40 px) и при фокусе с клавиатуры; форма открывается там же,
 * карточка встаёт в конец. В пустой ячейке кнопка видна всегда — иначе не найти, как создать карточку (и на
 * планшете нет наведения). Во время перетаскивания кнопки нет, зона остаётся: бросок принимает вся ячейка.
 */
export const BoardCell = memo(function BoardCell({
  id,
  label,
  boardId,
  columnId,
  columnName,
  laneId,
  cardIds,
  cardsById,
  lookups,
  canEdit,
  dragging,
  topForm,
  onOpen,
}: {
  id: string
  /** Подпись ячейки для скринридеров и тестов: колонка (и дорожка, если их несколько). */
  label: string
  boardId: string
  columnId: string
  columnName: string
  laneId: string
  cardIds: string[]
  cardsById: Map<string, BoardCard>
  lookups: BoardLookups
  canEdit: boolean
  /** Идёт перетаскивание карточки — кнопки добавления не показываем. */
  dragging: boolean
  topForm?: TopCardForm
  onOpen: (key: string) => void
}) {
  const { t } = useTranslation('boards')
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit })
  const [adding, setAdding] = useState(false)
  const empty = cardIds.length === 0
  const ownCardIds = () => cardIds

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={cn(
        'bg-muted/40 flex min-h-24 w-68 shrink-0 flex-col gap-2 rounded-lg p-2',
        isOver && 'bg-muted',
      )}
    >
      {canEdit && topForm && (
        <AddCardForm
          boardId={boardId}
          columnId={columnId}
          columnName={columnName}
          laneId={laneId}
          lanes={topForm.lanes}
          place="start"
          cellCardIds={topForm.cellCardIds}
          label={t('addCard.topLabel', { column: columnName })}
          onClose={topForm.onClose}
        />
      )}
      <SortableContext id={id} items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2" data-cell={id}>
          {cardIds.map((cardId) => {
            const card = cardsById.get(cardId)
            if (!card) return null
            return (
              <SortableCardTile
                key={cardId}
                card={card}
                lookups={lookups}
                draggable={canEdit && card.can_edit}
                onOpen={onOpen}
              />
            )
          })}
        </div>
      </SortableContext>
      {canEdit && adding && (
        <AddCardForm
          boardId={boardId}
          columnId={columnId}
          columnName={columnName}
          laneId={laneId}
          place="end"
          cellCardIds={ownCardIds}
          label={t('addCard.label', { column: columnName })}
          onClose={() => setAdding(false)}
        />
      )}
      {canEdit && !adding && (
        // Зона под последней карточкой: наведение на неё показывает кнопку
        <div className="group/add flex min-h-10 flex-1 flex-col">
          {!dragging && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'text-muted-foreground justify-start',
                !empty &&
                  'opacity-0 transition-opacity group-hover/add:opacity-100 focus-visible:opacity-100',
              )}
              data-reveal={empty ? undefined : 'hover'}
              aria-label={t('addCard.label', { column: columnName })}
              onClick={() => setAdding(true)}
            >
              <Plus />
              {t('addCard.button')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
