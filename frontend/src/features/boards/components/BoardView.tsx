import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type RefObject,
} from 'react'
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
import type { BoardDetail, Lane } from '@/shared/types/api'
import { useCurrentUser } from '@/features/auth/queries'
import {
  allLanesCollapsed,
  buildLayout,
  buildLookups,
  cellId,
  countCards,
  parseCellId,
} from '../model'
import { boardKeyboardCoordinates, useBoardDnd, type CollapsedLaneProbe } from '../useBoardDnd'
import { useCardMove } from '../useCardMove'
import { useLaneCollapse } from '../useLaneCollapse'
import { useStickyLaneRows } from '../useStickyLaneRows'
import { BoardCell, COLUMN_DIVIDER, SUBCOLUMN_DIVIDER, type TopCardForm } from './BoardCell'
import { CardTileView } from './CardTile'
import { LaneRow } from './LaneRow'
import { ColumnHeader } from './StructureMenus'
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
 *
 * Дорожки — строки внутри блока доски (LATER-55): строка дорожки (название, счётчик, свернуть) и под ней ячейки по
 * колонкам; одна дорожка — без строки. Свёрнутая пользователем дорожка — одна строка: ячеек нет, «+ Карточка» нет,
 * бросок не принимает; «+» в заголовке колонки открывает форму в первой развёрнутой дорожке.
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
  const setLaneCollapsed = useLaneCollapse(board.id)

  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  // Строки свёрнутых дорожек — над ними перетаскиваемая карточка цели не находит (useBoardDnd). Считаются только в
  // видимой части тела доски ниже закреплённых заголовков: строка тянется на всю ширину прокрутки, а уехавшая под
  // заголовки — не перехватывает указатель над ними. Вертикаль — в координатах содержимого холста
  const collapsedRows = useRef(new Map<string, HTMLElement>())
  const collapsedLaneAt = useCallback(({ x, y }: { x: number; y: number }) => {
    const body = bodyRef.current
    if (!body || collapsedRows.current.size === 0) return null
    const scroll = body.closest('[data-board-canvas]')?.scrollTop ?? 0
    const visible = body.getBoundingClientRect()
    const top = stickyRef.current?.getBoundingClientRect().bottom ?? visible.top
    // Свёрнутые дорожки в конце доски — ниже тела, под полосой прокрутки: по вертикали — до низа блока
    const bottom = body.parentElement?.getBoundingClientRect().bottom ?? visible.bottom
    const probe: CollapsedLaneProbe = { y: y + scroll, band: null }
    if (x < visible.left || x > visible.right || y < top || y > bottom) return probe
    for (const row of collapsedRows.current.values()) {
      const rect = row.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        probe.band = { top: rect.top + scroll, bottom: rect.bottom + scroll }
        break
      }
    }
    return probe
  }, [])
  const { cells, cardsById, activeCard, guardClick, collisionDetection, handlers } = useBoardDnd(
    board.cards,
    moveCard,
    collapsedLaneAt,
  )
  const openCard = useMemo(() => guardClick(onOpenCard), [guardClick, onOpenCard])
  // Ячейка, где сейчас переносимая карточка, — туда она и упадёт (подсветка)
  const targetCell = activeCard
    ? Object.keys(cells).find((key) => cells[key].includes(activeCard.id))
    : undefined
  const canEdit = board.permissions.edit_cards
  const canManage = board.permissions.manage
  const topLevel = layout.groups.map((group) => group.column)
  const showLaneHeaders = board.lanes.length > 1
  // Одна дорожка — строки нет, свернуть её нельзя (даже если свернули, пока дорожек было больше)
  const collapsed = useMemo(
    () => new Set(showLaneHeaders ? board.collapsed_lane_ids : []),
    [showLaneHeaders, board.collapsed_lane_ids],
  )
  // Свёрнутые дорожки в конце доски (идут подряд до последней) под развёрнутыми — после полосы прокрутки вбок, вне
  // тела (renderLane). Свёрнуты все — остаются в теле: полосы прокрутки тогда нет, а пустое тело (одна линейка нулевой
  // высоты) браузер вбок не прокручивает
  let tail = board.lanes.length
  while (showLaneHeaders && tail > 0 && collapsed.has(board.lanes[tail - 1].id)) tail--
  if (tail === 0) tail = board.lanes.length
  const laneCounts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const card of board.cards) result[card.lane_id] = (result[card.lane_id] ?? 0) + 1
    return result
  }, [board.cards])
  // «+» в заголовке листовой колонки: форма в её ячейке первой развёрнутой дорожки, карточка — в начало (LATER-44).
  // Свёрнуты все — «+» разворачивает первую дорожку и открывает форму в ней (решение PM 4). Форма привязана к своей
  // дорожке: её свернули (или не удалось развернуть) — форма закрывается, а не переезжает в другую дорожку
  const [topForm, setTopForm] = useState<{ columnId: string; laneId: string } | null>(null)
  const [seenCollapsed, setSeenCollapsed] = useState(collapsed)
  if (seenCollapsed !== collapsed) {
    setSeenCollapsed(collapsed)
    if (topForm && collapsed.has(topForm.laneId) && !seenCollapsed.has(topForm.laneId))
      setTopForm(null)
  }
  const firstLaneId = board.lanes.find((lane) => !collapsed.has(lane.id))?.id
  const addCardAtTop = (columnId: string) =>
    canEdit
      ? () => {
          const laneId = firstLaneId ?? board.lanes[0]?.id
          if (!laneId) return
          if (!firstLaneId) setLaneCollapsed(laneId, false)
          setTopForm({ columnId, laneId })
        }
      : undefined
  const topFormProps = (columnId: string): TopCardForm => ({
    lanes: board.lanes,
    cellCardIds: (laneId) => cells[cellId(columnId, laneId)] ?? EMPTY,
    onClose: () => setTopForm(null),
  })

  useSyncedScrollLeft({ body: bodyRef, header: headerRef, bar: barRef })
  // Закреплённая полоса дорожки (useStickyLaneRows) — тоже над элементом, к которому прокручивают
  useStickyOffset(stickyRef, bodyRef, showLaneHeaders ? LANE_ROW_PX : 0)
  const updateStickyBands = useStickyLaneRows(bodyRef, stickyRef)
  // Свернули или развернули дорожку — полоса остаётся там же на экране: свёрнутая из закреплённой полосы доска остаётся
  // на этой дорожке, а не уезжает к следующим (её карточки пропали) или к началу (замечание PM к PR 2)
  const toggleAnchor = useRef<{ laneId: string; top: number } | null>(null)
  const laneRowOf = (laneId: string) =>
    bodyRef.current?.parentElement?.querySelector<HTMLElement>(
      `[data-lane-section="${laneId}"] [data-lane-row]`,
    )
  const toggleLane = (laneId: string, collapse: boolean) => {
    const row = laneRowOf(laneId)
    if (row) toggleAnchor.current = { laneId, top: row.getBoundingClientRect().top }
    setLaneCollapsed(laneId, collapse)
  }
  useLayoutEffect(() => {
    updateStickyBands()
    const anchor = toggleAnchor.current
    toggleAnchor.current = null
    const row = anchor && laneRowOf(anchor.laneId)
    const canvas = bodyRef.current?.closest('[data-board-canvas]')
    if (!anchor || !row || !canvas) return
    // Полоса снова в потоке (пересчёт выше) — холст сдвигается так, чтобы она стояла, где была
    canvas.scrollTop += row.getBoundingClientRect().top - anchor.top
    updateStickyBands()
  }, [collapsed, updateStickyBands])
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

  /**
   * Дорожка: полоса (если дорожек больше одной) и ячейки по колонкам. trailing — свёрнутая дорожка в конце доски: она
   * вне тела, после полосы прокрутки вбок (у неё нет ячеек, прокручивать вбок нечего), — так блок кончается её полосой,
   * а полоса прокрутки остаётся под развёрнутыми дорожками выше (LATER-70, LATER-4).
   */
  const renderLane = (lane: Lane, index: number, trailing: boolean) => {
    const isCollapsed = collapsed.has(lane.id)
    return (
      <section
        key={lane.id}
        aria-label={lane.name}
        data-lane-section={lane.id}
        // Последняя дорожка тянется до низа доски — фон колонок доходит до низа блока
        className={cn(
          'flex flex-col',
          !isCollapsed && index === board.lanes.length - 1 && 'flex-1',
        )}
      >
        {/* Обёртка держит место полосы в потоке, когда сама полоса закреплена под заголовками колонок */}
        {showLaneHeaders && (
          <div className={cn('h-10', !trailing && '-mx-3')}>
            <LaneRow
              lane={lane}
              lanes={board.lanes}
              count={laneCounts[lane.id] ?? 0}
              collapsed={isCollapsed}
              canManage={canManage}
              // Дорожки разделены тонкой линией; над первой — нижняя граница заголовков колонок
              className={cn(index > 0 && 'border-t')}
              rowRef={(row) => {
                if (row && isCollapsed) collapsedRows.current.set(lane.id, row)
                else collapsedRows.current.delete(lane.id)
              }}
              onAction={onAction}
              onToggle={() => toggleLane(lane.id, !isCollapsed)}
            />
          </div>
        )}
        {/* Без вертикальных отступов: линии между колонками — от строки заголовков до низа дорожки */}
        {!isCollapsed && (
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
                  highlighted={id === targetCell}
                  topForm={
                    topForm?.columnId === column.id && topForm.laneId === lane.id
                      ? topFormProps(column.id)
                      : undefined
                  }
                  onOpen={openCard}
                />
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      {...handlers}
      accessibility={accessibility}
    >
      {/* Заголовки колонок: закреплены под шапкой доски (h-12), сдвигаются вбок вместе с телом */}
      <div ref={stickyRef} className="bg-board sticky top-12 z-10 border-b">
        {/* Фокус Tab на точке или «⋯» колонки у края — строка сдвигается к ней, тело — следом (useSyncedScrollLeft) */}
        <div
          ref={headerRef}
          className="relative overflow-hidden"
          data-board-columns
          onFocus={revealFocused}
        >
          {/* Отступы слева и справа — как у шапки доски: колонки не касаются края блока ни в начале, ни в конце
              прокрутки (LATER-65); у строки заголовков и тела одинаковые, иначе заголовки разъедутся с колонками */}
          {/* Вертикальные отступы — у колонок, а не у строки: линии между колонками — на всю её высоту */}
          <div className="inline-flex min-w-full gap-2 px-3">
            {layout.groups.map((group) => (
              <div key={group.column.id} className={cn('flex flex-col gap-1 py-2', COLUMN_DIVIDER)}>
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
                      <div key={child.id} className={cn('w-68', SUBCOLUMN_DIVIDER)}>
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
        <EdgeShades bodyRef={bodyRef} />
      </div>

      {/* Тело доски — прокрутка вбок. relative обязателен: без него абсолютно позиционированные потомки (sr-only
          в карточках) отсчитываются от корня документа, не обрезаются этим контейнером и растягивают страницу.
          scroll-margin потомков: фокус и прокрутка к карточке или форме не прячут её под закреплённые заголовки */}
      <div
        ref={bodyRef}
        className="relative flex flex-1 scrollbar-none flex-col overflow-x-auto [&_*]:scroll-mt-(--board-sticky)"
        data-board-body
        onFocus={revealFocused}
      >
        {/* Отступы слева и справа — у контейнера (как у строки заголовков, LATER-65); строка дорожки растянута на всю
            ширину блока отрицательными полями */}
        <div className="flex min-w-full flex-1 flex-col self-start px-3">
          {/* Линейка нулевой высоты по колонкам: ширину тела задают не только ячейки — свёрнуты все дорожки, а доска
              всё равно прокручивается вбок до последней колонки (вместе с заголовками) */}
          <div aria-hidden className="flex h-0 gap-2">
            {layout.leaves.map((column) => (
              <div key={column.id} className="w-68 shrink-0" />
            ))}
          </div>
          {board.lanes.slice(0, tail).map((lane, index) => renderLane(lane, index, false))}
        </div>
      </div>
      {/* Затенение краёв тела — поверх него, вне прокрутки (место — в блоке доски, relative) */}
      <EdgeShades bodyRef={bodyRef} stickyRef={stickyRef} overBody />

      {/* Свёрнуты все дорожки — полосы прокрутки вбок нет (иначе она стояла бы между заголовками и полосами): вбок доска
          прокручивается тачпадом, Shift+колесом над заголовками и с клавиатуры (LATER-70) */}
      <BoardScrollbar barRef={barRef} bodyRef={bodyRef} hidden={allLanesCollapsed(board)} />
      {/* Свёрнутые дорожки в конце — под полосой прокрутки: блок кончается последней полосой (LATER-70) */}
      {board.lanes.slice(tail).map((lane, index) => renderLane(lane, tail + index, true))}
      <DragOverlay>
        {activeCard && (
          <CardTileView card={activeCard} lookups={lookups} className="w-64 rotate-2 shadow-lg" />
        )}
      </DragOverlay>
    </DndContext>
  )
}

const EMPTY: string[] = []

/** Запас до края видимой части тела — ширина затенения края (EdgeShade): карточка с рамкой фокуса не под тенью. */
const FOCUS_MARGIN_PX = 24

/**
 * Элемент тела доски (или строки заголовков колонок), получивший фокус с клавиатуры (Tab), — целиком в видимой части по
 * горизонтали. Chrome сам прокручивает только полностью скрытый элемент: у частично видимой карточки (узкая доска,
 * колонка у края) правый край и рамка фокуса оставались за краем. Прокручивается вбок только сама доска, холст и окно —
 * нет (UX-ревью LATER-81, U-3). Щелчок мышью доску не сдвигает (фокус не :focus-visible). Фокус в меню и окнах из
 * порталов (событие React всплывает и оттуда) — не в счёт: меню у края сдвигало бы доску на каждом пункте.
 */
function revealFocused(event: FocusEvent<HTMLDivElement>) {
  const body = event.currentTarget
  const target = event.target
  if (
    !(target instanceof HTMLElement) ||
    !body.contains(target) ||
    !target.matches(':focus-visible')
  )
    return
  const view = body.getBoundingClientRect()
  const left = view.left + FOCUS_MARGIN_PX
  const right = view.left + body.clientWidth - FOCUS_MARGIN_PX
  const rect = target.getBoundingClientRect()
  if (rect.left < left || rect.width > right - left) body.scrollLeft += rect.left - left
  else if (rect.right > right) body.scrollLeft += rect.right - right
}

/** Шапка доски (h-12) над закреплёнными заголовками колонок — их высота разная (подколонки). */
const BOARD_HEADER_PX = 48
/** Полоса дорожки (h-10, LaneRow). */
const LANE_ROW_PX = 40

/** Края тела доски, за которыми ещё есть колонки, и место тела в блоке доски — для затенения (EdgeShade). */
interface ScrollEdges {
  start: boolean
  end: boolean
  body: { top: number; height: number }
}

/**
 * Затенение обоих краёв: над строкой заголовков колонок (внутри неё) или над телом доски (overBody — в блоке доски, по
 * месту тела). Состояние — своё у этой пары: прокрутка и рост доски перерисовывают только её, а не всю доску.
 */
function EdgeShades({
  bodyRef,
  stickyRef,
  overBody = false,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  stickyRef?: RefObject<HTMLDivElement | null>
  overBody?: boolean
}) {
  const edges = useScrollEdges(bodyRef, stickyRef, overBody)
  const place = overBody ? { style: edges.body } : { className: 'inset-y-0' }
  return (
    <>
      <EdgeShade side="start" visible={edges.start} {...place} />
      <EdgeShade side="end" visible={edges.end} {...place} />
    </>
  )
}

/**
 * Можно ли листать тело доски вбок дальше влево (start) и вправо (end): у доски шире видимой части это почти незаметно —
 * на macOS полоса прокрутки скрыта, а колонка у края срезана как раз по границе (U-7 UX-ревью варианта Б; дополнение PM
 * 21.10 к пачке LATER-74). Пересчёт — при прокрутке тела и смене размеров тела и строки заголовков.
 */
function useScrollEdges(
  bodyRef: RefObject<HTMLDivElement | null>,
  stickyRef: RefObject<HTMLDivElement | null> | undefined,
  trackPlace: boolean,
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({
    start: false,
    end: false,
    body: { top: 0, height: 0 },
  })
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => {
      const start = body.scrollLeft > 1
      const end = body.scrollLeft + body.clientWidth < body.scrollWidth - 1
      // Место тела нужно только затенению над телом: строке заголовков рост доски безразличен
      const top = trackPlace ? body.offsetTop : 0
      const height = trackPlace ? body.offsetHeight : 0
      setEdges((prev) =>
        prev.start === start &&
        prev.end === end &&
        prev.body.top === top &&
        prev.body.height === height
          ? prev
          : { start, end, body: { top, height } },
      )
    }
    measure()
    body.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    if (stickyRef?.current) observer.observe(stickyRef.current)
    return () => {
      body.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [bodyRef, stickyRef, trackPlace])
  return edges
}

/**
 * Край тела доски, за которым ещё есть колонки: содержимое растворяется в фоне доски (градиент цветом `board` от края
 * внутрь — видно в обеих темах, тёмная тень на тёмной доске терялась; «Редизайн», шаг 2), пропадает, когда тело докручено
 * до этого края. Поверх карточек; под полосой дорожки (её название и шеврон стоят у краёв и блёкли — U-4 «Редизайна»),
 * закреплёнными шапкой и заголовками.
 */
function EdgeShade({
  side,
  visible,
  className,
  style,
}: {
  side: 'start' | 'end'
  visible: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'from-board pointer-events-none absolute z-[6] w-6 to-transparent transition-opacity',
        side === 'start' ? 'left-0 bg-linear-to-r' : 'right-0 bg-linear-to-l',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={style}
      data-board-shade={side}
      data-visible={visible || undefined}
    />
  )
}

/**
 * Высота закреплённых шапки и заголовков колонок (и полосы дорожки — extra) — в CSS-переменную `--board-sticky` тела
 * доски: от неё отступ при прокрутке к элементу (scroll-margin), чтобы он не оказался под заголовками.
 */
function useStickyOffset(
  stickyRef: RefObject<HTMLDivElement | null>,
  bodyRef: RefObject<HTMLDivElement | null>,
  extra: number,
) {
  useEffect(() => {
    const sticky = stickyRef.current
    const body = bodyRef.current
    if (!sticky || !body) return
    const measure = () =>
      body.style.setProperty(
        '--board-sticky',
        `${BOARD_HEADER_PX + sticky.offsetHeight + extra + 8}px`,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(sticky)
    return () => observer.disconnect()
  }, [stickyRef, bodyRef, extra])
}

/**
 * Полоса горизонтальной прокрутки доски внизу окна (LATER-4): закреплена у нижнего края холста, пока доска на экране,
 * у короткой доски стоит под ней. Повторяет прокрутку тела (useSyncedScrollLeft); нет переполнения — нет полосы.
 */
function BoardScrollbar({
  barRef,
  bodyRef,
  hidden,
}: {
  barRef: RefObject<HTMLDivElement | null>
  bodyRef: RefObject<HTMLDivElement | null>
  hidden: boolean
}) {
  const [size, setSize] = useState({ content: 0, overflows: false })

  // Скрытая полоса прокрутку не повторяет (у неё нет размеров) — показали снова: на место тела
  useEffect(() => {
    if (!hidden && barRef.current && bodyRef.current)
      barRef.current.scrollLeft = bodyRef.current.scrollLeft
  }, [hidden, barRef, bodyRef])

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
        'bg-board/90 sticky bottom-0 z-10 [scrollbar-width:thin] overflow-x-auto overflow-y-hidden [contain:inline-size]',
        hidden ? 'hidden' : size.overflows ? 'min-h-3' : 'invisible h-0',
      )}
      data-board-scrollbar
    >
      <div className="h-px" style={{ width: size.content }} />
    </div>
  )
}
