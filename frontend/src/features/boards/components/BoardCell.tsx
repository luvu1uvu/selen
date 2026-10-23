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

/**
 * Тонкая вертикальная линия между колонками (как в Kaiten): посередине зазора gap-2 слева от элемента, у первого
 * в ряду — нет. Одна и та же у заголовков колонок и ячеек — линии идут от верха строки заголовков до низа дорожки.
 */
const DIVIDER =
  'relative not-first:before:absolute not-first:before:-left-[4.5px] not-first:before:w-px not-first:before:bg-border'
/** Линия на всю высоту элемента: ячейка, заголовок колонки первого уровня. */
export const COLUMN_DIVIDER = `${DIVIDER} not-first:before:inset-y-0`
/** Линия между подколонками: от их заголовка до низа строки заголовков (через её нижний отступ). */
export const SUBCOLUMN_DIVIDER = `${DIVIDER} not-first:before:top-0 not-first:before:-bottom-2`

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
 *
 * Ячейка без своего фона: колонки разделены тонкими линиями (решение PM 19.10, как в Kaiten). Во время переноса
 * ячейка, куда упадёт карточка, подсвечена (highlighted), а место в ней — пунктирная рамка (SortableCardTile).
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
  highlighted,
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
  /** Переносимая карточка сейчас здесь — сюда она и упадёт. */
  highlighted?: boolean
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
        'flex min-h-24 w-68 shrink-0 flex-col gap-2 p-2',
        COLUMN_DIVIDER,
        (highlighted || isOver) && 'bg-muted',
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
      {canEdit && (
        // Зона под последней карточкой: наведение на неё показывает кнопку. Пока форма открыта, кнопка скрыта, но не
        // убрана: закрытая Esc или «Отмена» форма возвращает фокус на неё (LATER-107)
        <div className={cn('group/add flex min-h-10 flex-1 flex-col', adding && 'hidden')}>
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
