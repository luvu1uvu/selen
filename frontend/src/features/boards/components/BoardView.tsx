import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import type { BoardDetail } from '@/shared/types/api'
import { useCurrentUser } from '@/features/auth/queries'
import { buildLayout, buildLookups, cellId, countCards, parseCellId } from '../model'
import { useBoardDnd } from '../useBoardDnd'
import { useCardMove } from '../useCardMove'
import { BoardCell, type TopCardForm } from './BoardCell'
import { CardTileView } from './CardTile'
import { ColumnHeader, LaneHeader } from './StructureMenus'
import type { StructureAction } from './StructureDialogs'

/**
 * Доска: колонки (с подколонками) × дорожки. Карточки перетаскиваются между ячейками и внутри ячейки.
 * Во время перетаскивания порядок держится в локальном состоянии, после отпускания — оптимистично
 * в кеше доски; сервер получает только соседей (after_id/before_id) и сам вычисляет позицию.
 */
export function BoardView({
  board,
  onOpenCard,
  onAction,
}: {
  board: BoardDetail
  onOpenCard: (key: string) => void
  onAction: (action: StructureAction) => void
}) {
  const { t } = useTranslation('boards')
  const layout = useMemo(() => buildLayout(board.columns), [board.columns])
  const counts = useMemo(() => countCards(board, layout), [board, layout])
  const { data: me } = useCurrentUser()
  const lookups = useMemo(() => buildLookups(board, me?.timezone), [board, me?.timezone])
  const moveCard = useCardMove(board.id)
  const { cells, cardsById, activeCard, guardClick, collisionDetection, handlers } = useBoardDnd(
    board.cards,
    moveCard,
  )
  const openCard = useMemo(() => guardClick(onOpenCard), [guardClick, onOpenCard])
  const canEdit = board.permissions.edit_cards
  const canManage = board.permissions.manage
  const topLevel = layout.groups.map((group) => group.column)
  const showLaneHeaders = board.lanes.length > 1
  // «+» в заголовке листовой колонки: форма в её ячейке первой дорожки, карточка — в начало (LATER-44)
  const [topFormColumn, setTopFormColumn] = useState<string | null>(null)
  const firstLaneId = board.lanes[0]?.id
  const addCardAtTop = (columnId: string) =>
    canEdit ? () => setTopFormColumn(columnId) : undefined
  const topForm = (columnId: string): TopCardForm => ({
    lanes: board.lanes,
    cellCardIds: (laneId) => cells[cellId(columnId, laneId)] ?? EMPTY,
    onClose: () => setTopFormColumn(null),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Пробел — взять/положить, стрелки — двигать, Esc — отмена. Enter оставлен для открытия карточки.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )

  // Объявления для скринридеров: по-русски, с номером карточки и названием колонки/дорожки
  const columnsById = new Map(board.columns.map((c) => [c.id, c.name]))
  const lanesById = new Map(board.lanes.map((l) => [l.id, l.name]))
  const cardName = (id: string | number) => cardsById.get(String(id))?.key ?? ''
  const placeName = (id: string | number | undefined) => {
    if (id === undefined) return ''
    const cell = String(id).includes(':')
      ? String(id)
      : Object.keys(cells).find((key) => cells[key].includes(String(id)))
    if (!cell) return ''
    const { columnId, laneId } = parseCellId(cell)
    return showLaneHeaders
      ? `${columnsById.get(columnId)} / ${lanesById.get(laneId)}`
      : (columnsById.get(columnId) ?? '')
  }
  const accessibility = {
    screenReaderInstructions: { draggable: t('dnd.instructions') },
    announcements: {
      onDragStart: ({ active }: DragStartEvent) => t('dnd.pickedUp', { card: cardName(active.id) }),
      onDragOver: ({ active, over }: DragOverEvent) =>
        over ? t('dnd.over', { card: cardName(active.id), place: placeName(over.id) }) : undefined,
      onDragEnd: ({ active, over }: DragEndEvent) =>
        over
          ? t('dnd.dropped', { card: cardName(active.id), place: placeName(over.id) })
          : t('dnd.cancelled', { card: cardName(active.id) }),
      onDragCancel: ({ active }: { active: { id: string | number } }) =>
        t('dnd.cancelled', { card: cardName(active.id) }),
    },
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      {...handlers}
      accessibility={accessibility}
    >
      {/* relative обязателен: без него абсолютно позиционированные потомки (sr-only в карточках)
          отсчитываются от корня документа, не обрезаются этим контейнером и растягивают всю страницу */}
      <div className="relative overflow-x-auto pb-4">
        <div className="inline-flex min-w-full flex-col gap-2">
          <div className="flex gap-2">
            {layout.groups.map((group) => (
              <div key={group.column.id} className="flex flex-col gap-1">
                <div className={group.children.length ? 'w-full' : 'w-68'}>
                  <ColumnHeader
                    column={group.column}
                    siblings={topLevel}
                    count={counts[group.column.id] ?? 0}
                    isTopLevel
                    canManage={canManage}
                    onAction={onAction}
                    onAddCard={group.children.length ? undefined : addCardAtTop(group.column.id)}
                  />
                </div>
                {group.children.length > 0 && (
                  <div className="flex gap-2">
                    {group.children.map((child) => (
                      <div key={child.id} className="w-68">
                        <ColumnHeader
                          column={child}
                          siblings={group.children}
                          count={counts[child.id] ?? 0}
                          isTopLevel={false}
                          canManage={canManage}
                          onAction={onAction}
                          onAddCard={addCardAtTop(child.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {board.lanes.map((lane) => (
            <section key={lane.id} aria-label={lane.name}>
              {showLaneHeaders && (
                <LaneHeader
                  lane={lane}
                  lanes={board.lanes}
                  canManage={canManage}
                  onAction={onAction}
                />
              )}
              <div className="flex items-stretch gap-2">
                {layout.leaves.map((column) => {
                  const id = cellId(column.id, lane.id)
                  return (
                    <BoardCell
                      key={id}
                      id={id}
                      label={showLaneHeaders ? `${column.name} / ${lane.name}` : column.name}
                      boardId={board.id}
                      columnId={column.id}
                      columnName={column.name}
                      laneId={lane.id}
                      cardIds={cells[id] ?? EMPTY}
                      cardsById={cardsById}
                      lookups={lookups}
                      canEdit={canEdit}
                      dragging={activeCard !== undefined}
                      topForm={
                        topFormColumn === column.id && lane.id === firstLaneId
                          ? topForm(column.id)
                          : undefined
                      }
                      onOpen={openCard}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeCard && (
          <CardTileView card={activeCard} lookups={lookups} className="w-64 rotate-2 shadow-lg" />
        )}
      </DragOverlay>
    </DndContext>
  )
}

const EMPTY: string[] = []
