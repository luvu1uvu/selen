import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { useScrollMemory } from '@/shared/lib/useScrollMemory'
import { useSyncedScrollLeft } from '@/shared/lib/useSyncedScrollLeft'
import type { BoardDetail } from '@/shared/types/api'
import { useCurrentUser } from '@/features/auth/queries'
import { buildLayout, buildLookups, cellId, countCards, parseCellId } from '../model'
import { boardKeyboardCoordinates, useBoardDnd } from '../useBoardDnd'
import { useCardMove } from '../useCardMove'
import { BoardCell, type TopCardForm } from './BoardCell'
import { CardTileView } from './CardTile'
import { ColumnHeader, LaneHeader } from './StructureMenus'
import type { StructureAction } from './StructureDialogs'

/**
 * Доска: колонки (с подколонками) × дорожки. Карточки перетаскиваются между ячейками и внутри ячейки.
 * Во время перетаскивания порядок держится в локальном состоянии, после отпускания — оптимистично
 * в кеше доски; сервер получает только соседей (after_id/before_id) и сам вычисляет позицию.
 *
 * Прокрутка (ADR-0019): по вертикали прокручивается холст страницы, вбок — тело доски. Строка заголовков колонок
 * закреплена вверху холста под шапкой доски, поэтому она вне тела (внутри прокручиваемого вбок тела `sticky`
 * привязался бы к нему, а не к холсту) и повторяет его горизонтальную прокрутку; родная полоса прокрутки тела
 * скрыта, вместо неё — полоса внизу окна. Автопрокрутка при перетаскивании: у края доски едет тело, у верхнего
 * и нижнего края окна — холст.
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

  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  useSyncedScrollLeft({ body: bodyRef, header: headerRef, bar: barRef })
  const stickyRef = useRef<HTMLDivElement>(null)
  useStickyOffset(stickyRef, bodyRef)
  // «Назад» возвращает и прокрутку доски вбок
  useScrollMemory(bodyRef, { name: `board:${board.id}`, page: board.id, axis: 'x' })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Пробел — взять/положить, стрелки — двигать, Esc — отмена. Enter оставлен для открытия карточки.
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
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
      {/* Заголовки колонок: закреплены под шапкой доски (h-12), сдвигаются вбок вместе с телом */}
      <div ref={stickyRef} className="bg-background sticky top-12 z-10 border-b">
        <div ref={headerRef} className="overflow-hidden" data-board-columns>
          {/* Отступы слева и справа — как у шапки доски: колонки не касаются края блока ни в начале, ни в конце
              прокрутки (LATER-65); у строки заголовков и тела одинаковые, иначе заголовки разъедутся с колонками */}
          <div className="inline-flex min-w-full gap-2 px-3 py-2">
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
        </div>
      </div>

      {/* Тело доски — прокрутка вбок. relative обязателен: без него абсолютно позиционированные потомки (sr-only
          в карточках) отсчитываются от корня документа, не обрезаются этим контейнером и растягивают страницу.
          scroll-margin потомков: фокус и прокрутка к карточке или форме не прячут её под закреплённые заголовки */}
      <div
        ref={bodyRef}
        className="relative flex flex-1 scrollbar-none flex-col overflow-x-auto [&_*]:scroll-mt-(--board-sticky)"
        data-board-body
      >
        <div className="flex min-w-full flex-1 flex-col gap-2 self-start px-3 py-2">
          {board.lanes.map((lane, index) => (
            <section
              key={lane.id}
              aria-label={lane.name}
              // Последняя дорожка тянется до низа доски — фон колонок доходит до низа окна
              className={cn('flex flex-col', index === board.lanes.length - 1 && 'flex-1')}
            >
              {showLaneHeaders && (
                <LaneHeader
                  lane={lane}
                  lanes={board.lanes}
                  canManage={canManage}
                  onAction={onAction}
                />
              )}
              <div className="flex flex-1 items-stretch gap-2">
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

      <BoardScrollbar barRef={barRef} bodyRef={bodyRef} />
      <DragOverlay>
        {activeCard && (
          <CardTileView card={activeCard} lookups={lookups} className="w-64 rotate-2 shadow-lg" />
        )}
      </DragOverlay>
    </DndContext>
  )
}

const EMPTY: string[] = []

/** Шапка доски (h-12) над закреплёнными заголовками колонок — их высота разная (подколонки). */
const BOARD_HEADER_PX = 48

/**
 * Высота закреплённых шапки и заголовков колонок — в CSS-переменную `--board-sticky` тела доски: от неё
 * отступ при прокрутке к элементу (scroll-margin), чтобы он не оказался под заголовками.
 */
function useStickyOffset(
  stickyRef: RefObject<HTMLDivElement | null>,
  bodyRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const sticky = stickyRef.current
    const body = bodyRef.current
    if (!sticky || !body) return
    const measure = () =>
      body.style.setProperty('--board-sticky', `${BOARD_HEADER_PX + sticky.offsetHeight + 8}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(sticky)
    return () => observer.disconnect()
  }, [stickyRef, bodyRef])
}

/**
 * Полоса горизонтальной прокрутки доски внизу окна (LATER-4): закреплена у нижнего края холста, пока доска на экране,
 * у короткой доски стоит под ней. Повторяет прокрутку тела (useSyncedScrollLeft); нет переполнения — нет полосы.
 */
function BoardScrollbar({
  barRef,
  bodyRef,
}: {
  barRef: RefObject<HTMLDivElement | null>
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const [size, setSize] = useState({ content: 0, overflows: false })

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () =>
      setSize({
        content: body.scrollWidth,
        overflows: body.scrollWidth > body.clientWidth + 1,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    return () => observer.disconnect()
  }, [bodyRef])

  return (
    <div
      ref={barRef}
      aria-hidden
      tabIndex={-1}
      // Не ниже 12 px: у «плавающих» полос macOS есть за что ухватиться; обычная полоса (Windows, Safari) выше — растёт.
      // contain: inline-size — распорка полосы (ширина содержимого тела) не влияет на ширину блока доски: иначе блок,
      // хоть раз ставший шире колонок, сам держал эту ширину через полосу (LATER-66)
      className={cn(
        'bg-background/90 sticky bottom-0 z-10 [scrollbar-width:thin] overflow-x-auto overflow-y-hidden [contain:inline-size]',
        size.overflows ? 'min-h-3' : 'invisible h-0',
      )}
      data-board-scrollbar
    >
      <div className="h-px" style={{ width: size.content }} />
    </div>
  )
}
