import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { GripVertical, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { cn } from '@/shared/lib/utils'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useScrollMemory } from '@/shared/lib/useScrollMemory'
import type { Space, SpaceBoard } from '@/shared/types/api'
import { setBoardArchived, type BoardMoveTarget } from '../api'
import { groupRows, layoutDropAt, rowWidths, type LayoutDrop, type LayoutGeometry } from '../layout'
import { useSpaceBoards, useStructureMutation } from '../queries'
import { useBoardCollapse } from '../useBoardCollapse'
import { useMoveBoard } from '../useMoveBoard'
import { anchorOf, currentAnchor, pinBoard, rememberAnchor, takeFocus } from '../canvasAnchor'
import { CreateBoardDialog } from './CreateBoardDialog'
import { SpaceBoardSlot } from './SpaceBoardSlot'

/** У досок нет целей-droppable: куда упадёт доска, решает указатель (layoutDropAt). */
const noCollisions: CollisionDetection = () => []

/**
 * Холст страницы пространства (ADR-0019, docs/ui-reference/kaiten/README.md, раздел 03): все активные доски рядами —
 * в ряду доски рядом, ряды друг под другом, каждый от левого края; высота доски — по её содержимому (ответ PM 20.10).
 * Холст прокручивается по вертикали, каждая доска — вбок внутри своего блока. На узком экране ряды — в колонку.
 *
 * Администратор пространства переставляет доски мышью за ⠿ (свой DndContext страницы; у каждой доски — свой для
 * карточек) и пунктами меню «⋯» → «Переставить». Во время переноса раскладка не перестраивается: копия шапки идёт за
 * указателем, место показывает линия — в ряду между досками или между рядами (новый ряд).
 *
 * `?board=ID` (так открывает доску дерево): доска разворачивается — снимается личное сворачивание (решение PM 3) —
 * и холст прокручивается к ней.
 */
export function SpaceBoardsCanvas({
  space,
  active = true,
  onOpenCard,
}: {
  space: Space
  /** Вкладка «Доски» открыта: на другой вкладке холст скрыт, но не размонтирован. */
  active?: boolean
  onOpenCard: (key: string) => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const boardsQuery = useSpaceBoards(space.key)
  const boards = boardsQuery.data
  const rows = useMemo(() => groupRows(boards ?? []), [boards])
  const canManage = space.permissions.manage
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const setCollapsed = useBoardCollapse(space.key)
  const { moving, move } = useMoveBoard(space.key)
  const archive = useStructureMutation((boardId: string) => setBoardArchived(boardId, true))
  const [toArchive, setToArchive] = useState<SpaceBoard | null>(null)

  useKeepScrollWhileHidden(canvasRef, active)
  const page = `space:${space.key}`
  const byAnchor = useCanvasPlacement(canvasRef, boards, boardsQuery.isFetching, page, setCollapsed)
  useScrollMemory(canvasRef, {
    name: 'canvas',
    page,
    ready: boardsQuery.isSuccess,
    restore: !byAnchor,
  })
  // Доски первого экрана (первый ряд или ряд доски из ?board=ID) грузятся сразу, без ожидания IntersectionObserver:
  // он сообщит о них только после первой отрисовки — на кадр позже
  const [params] = useSearchParams()
  const focusId = params.get('board')
  const eagerRow = rows.find((row) => row.boards.some((b) => b.id === focusId)) ?? rows[0]
  const revealed = useFirstScreenReveal(boardsQuery.isSuccess, eagerRow)

  const onArchive = useCallback((board: SpaceBoard) => setToArchive(board), [])
  const { activeBoard, drop, dndProps } = useBoardLayoutDnd(contentRef, boards, move)
  const metrics = useRowMetrics(contentRef, boards)

  return (
    <div
      ref={canvasRef}
      className="bg-canvas relative min-h-0 flex-1 scroll-pb-6 overflow-x-hidden overflow-y-auto"
      data-board-canvas
    >
      <DndContext {...dndProps}>
        <div ref={contentRef} className="relative flex min-h-full flex-col gap-3 p-3 md:p-4">
          {boardsQuery.isPending && (
            <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
          )}
          {boardsQuery.isError && !boards && (
            <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
          )}
          {boardsQuery.isSuccess && rows.length === 0 && (
            <div className="text-muted-foreground bg-background flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center text-sm">
              <LayoutGrid className="size-8" />
              <p>{t('list.empty')}</p>
              <p>{canManage ? t('layout.emptyHint') : t('layout.emptyMember')}</p>
              {canManage && <CreateBoardDialog spaceKey={space.key} />}
            </div>
          )}
          {rows.map((row) => {
            // Ширины досок ряда — rowWidths: не уже 20rem, не поместились — на следующую строку ряда (LATER-81).
            // На экране 768 px и уже — колонка во всю ширину (брейкпоинт rows — с 769 px, index.css)
            const widths = rowWidths(row, metrics.width, metrics.collapsed)
            return (
              <div
                key={row.id}
                className={cn(
                  'rows:flex-row rows:flex-wrap rows:items-start flex flex-col gap-3',
                  !revealed.ready && row.id !== eagerRow?.id && 'invisible',
                )}
                data-board-row={row.id}
              >
                {row.boards.map((board) => (
                  <SpaceBoardSlot
                    key={board.id}
                    board={board}
                    width={widths.get(board.id)}
                    rows={rows}
                    canManage={canManage}
                    eager={row.id === eagerRow?.id}
                    onSettled={revealed.onSettled}
                    moving={moving}
                    dragging={activeBoard?.id === board.id}
                    onMove={move}
                    onToggleCollapsed={setCollapsed}
                    onArchive={onArchive}
                    onOpenCard={onOpenCard}
                  />
                ))}
              </div>
            )
          })}
          {drop && <DropLine drop={drop} />}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeBoard && (
            <div className="bg-background flex h-12 w-max max-w-80 items-center gap-1.5 rounded-xl border px-3 opacity-80 shadow-lg">
              <GripVertical className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate text-base font-semibold">{activeBoard.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        pending={archive.isPending}
        title={t('list.confirmArchiveTitle')}
        description={t('list.confirmArchiveText', { name: toArchive?.name ?? '' })}
        confirmLabel={t('list.archive')}
        onConfirm={async () => {
          if (!toArchive) return
          try {
            await archive.mutateAsync(toArchive.id)
            toast.success(t('list.archivedToast'))
          } catch (error) {
            toast.error(getErrorMessage(error, tc('errors.generic')))
          }
          setToArchive(null)
        }}
      />
    </div>
  )
}

/**
 * Линия-указатель места доски: вертикальная — в ряду между досками, горизонтальная — новый ряд между рядами.
 * Координаты — от угла содержимого холста (линия едет вместе с ним при прокрутке).
 */
function DropLine({ drop }: { drop: LayoutDrop }) {
  const style =
    drop.kind === 'row'
      ? {
          left: drop.line.x - 1.5,
          top: drop.line.top,
          height: drop.line.bottom - drop.line.top,
          width: 3,
        }
      : {
          left: drop.line.left,
          top: drop.line.y - 1.5,
          width: drop.line.right - drop.line.left,
          height: 3,
        }
  return (
    <div
      aria-hidden
      className="bg-primary pointer-events-none absolute z-30 rounded-full"
      style={style}
      data-board-drop={drop.kind}
    />
  )
}

/** Линия — от угла содержимого холста, а не окна. */
function relativeTo(drop: LayoutDrop, origin: DOMRect): LayoutDrop {
  return drop.kind === 'row'
    ? {
        ...drop,
        line: {
          x: drop.line.x - origin.left,
          top: drop.line.top - origin.top,
          bottom: drop.line.bottom - origin.top,
        },
      }
    : {
        ...drop,
        line: {
          y: drop.line.y - origin.top,
          left: drop.line.left - origin.left,
          right: drop.line.right - origin.left,
        },
      }
}

/** Где ряды и доски на экране сейчас (координаты окна) — для цели переноса. */
function measure(content: HTMLElement): LayoutGeometry {
  return {
    rows: [...content.querySelectorAll<HTMLElement>('[data-board-row]')].map((row) => {
      const rect = row.getBoundingClientRect()
      return {
        id: row.dataset.boardRow!,
        top: rect.top,
        bottom: rect.bottom,
        boards: [...row.querySelectorAll<HTMLElement>('[data-board-slot]')].map((slot) => {
          // Блок доски бывает уже своего места в ряду (w-fit) — линия у его края, а не у края места
          const block = (slot.firstElementChild as HTMLElement | null) ?? slot
          const box = block.getBoundingClientRect()
          return {
            id: slot.dataset.boardSlot!,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          }
        }),
      }
    }),
  }
}

/**
 * Перенос доски мышью за ⠿. Указатель отслеживается сам (pointermove), цель пересчитывается при его движении и при
 * автопрокрутке холста (dnd-kit прокручивает холст у верхнего и нижнего края окна). Отпустили над местом — запрос
 * перестановки; над своим местом или вне холста — ничего.
 */
function useBoardLayoutDnd(
  contentRef: RefObject<HTMLDivElement | null>,
  boards: SpaceBoard[] | undefined,
  move: (boardId: string, target: BoardMoveTarget) => void,
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drop, setDrop] = useState<LayoutDrop | null>(null)
  const dropRef = useRef<LayoutDrop | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const content = contentRef.current
    if (!activeId || !content) return
    const canvas = content.closest<HTMLElement>('[data-board-canvas]')
    const update = () => {
      const point = pointer.current
      // Вне холста (над деревом, панелями) цели нет: отпустили там — доска остаётся на месте
      const bounds = canvas?.getBoundingClientRect()
      const inside =
        !!point &&
        !!bounds &&
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
      const next = point && inside ? layoutDropAt(point, measure(content), activeId) : null
      dropRef.current = next
      setDrop(next && relativeTo(next, content.getBoundingClientRect()))
    }
    const onPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      update()
    }
    window.addEventListener('pointermove', onPointer)
    canvas?.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointer)
      canvas?.removeEventListener('scroll', update)
    }
  }, [activeId, contentRef])

  const reset = () => {
    setActiveId(null)
    setDrop(null)
    dropRef.current = null
    pointer.current = null
  }

  return {
    activeBoard: boards?.find((board) => board.id === activeId),
    drop,
    dndProps: {
      sensors,
      collisionDetection: noCollisions,
      onDragStart: ({ active, activatorEvent }: DragStartEvent) => {
        if (activatorEvent instanceof PointerEvent)
          pointer.current = { x: activatorEvent.clientX, y: activatorEvent.clientY }
        setActiveId(String(active.id))
      },
      onDragEnd: () => {
        const target = dropRef.current
        if (activeId && target) move(activeId, target.target)
        reset()
      },
      onDragCancel: reset,
    },
  }
}

interface RowMetrics {
  /** Ширина под доски ряда (содержимое холста без отступов); 0 — ещё не измерена. */
  width: number
  /** Ширины свёрнутых досок — по их шапке. */
  collapsed: ReadonlyMap<string, number>
}

/**
 * Ширина рядов и свёрнутых досок — для раздачи ширин развёрнутым доскам (rowWidths; LATER-79, LATER-81). Меряется до
 * первой отрисовки — без ширин доски ряда встают каждая на свою строку, и раскладка перескакивала бы (U-1 UX-ревью
 * LATER-81); дальше — ResizeObserver (окно, дерево, сворачивание). Скрытый холст (другая вкладка) не меряется — ширины
 * остаются прежними, возврат на «Доски» без сдвига.
 */
function useRowMetrics(
  contentRef: RefObject<HTMLDivElement | null>,
  boards: SpaceBoard[] | undefined,
): RowMetrics {
  const [metrics, setMetrics] = useState<RowMetrics>({ width: 0, collapsed: new Map() })
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      if (content.clientWidth === 0) return
      const style = getComputedStyle(content)
      const width = Math.floor(
        content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      )
      // Нужная ширина шапки, а не текущая: если название уже обрезано, текущая закрепила бы обрезку (U-4 UX-ревью PR 3)
      const collapsed = new Map(
        [...content.querySelectorAll<HTMLElement>('[data-board-collapsed]')].map((section) => {
          const title = section.querySelector('h2')
          const cut = title ? title.scrollWidth - title.clientWidth : 0
          return [
            section.dataset.boardBlock!,
            Math.ceil(section.getBoundingClientRect().width + cut),
          ]
        }),
      )
      setMetrics((previous) =>
        previous.width === width &&
        previous.collapsed.size === collapsed.size &&
        [...collapsed].every(([id, w]) => previous.collapsed.get(id) === w)
          ? previous
          : { width, collapsed },
      )
    }
    measure()
    // Без flushSync: он выполнял бы эффекты прямо здесь — подписки досок на IntersectionObserver раньше, чем холст после
    // «Назад» и перезагрузки встанет на запомненное место, и грузились бы доски выше него. Цена — при смене ширины окна
    // кадр со старыми ширинами (U-2 UX-ревью LATER-81, мелочь)
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    for (const section of content.querySelectorAll('[data-board-collapsed]'))
      observer.observe(section)
    return () => observer.disconnect()
  }, [contentRef, boards])
  return metrics
}

/**
 * Ряды, кроме ряда первого экрана, скрыты, пока его доски не загрузились: их заглушки ниже настоящих досок, и ряды ниже
 * были бы видны на экране, а потом уехали бы вниз («прыжок» при загрузке, U-5 UX-ревью PR 3). Показались — больше не
 * скрываются; на случай зависшей загрузки — не дольше 3 с.
 */
function useFirstScreenReveal(
  listed: boolean,
  row: ReturnType<typeof groupRows>[number] | undefined,
) {
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set())
  const [ready, setReady] = useState(false)
  const onSettled = useCallback(
    (boardId: string) =>
      setSettled((previous) => (previous.has(boardId) ? previous : new Set(previous).add(boardId))),
    [],
  )
  // Пока нет списка досок, рядов ещё нет — это не «загрузилось»
  const loaded =
    listed && (!row || row.boards.every((board) => board.collapsed || settled.has(board.id)))
  if (loaded && !ready) setReady(true)
  useEffect(() => {
    if (ready) return
    const timer = window.setTimeout(() => setReady(true), 3000)
    return () => window.clearTimeout(timer)
  }, [ready])
  return { ready: ready || loaded, onSettled }
}

/**
 * Скрытый (display: none) холст теряет прокрутку — после возврата на вкладку «Доски» она восстанавливается: место
 * запоминается при каждой прокрутке, пока холст виден.
 */
function useKeepScrollWhileHidden(canvasRef: RefObject<HTMLDivElement | null>, active: boolean) {
  const last = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return
    const save = () => (last.current = canvas.scrollTop)
    canvas.addEventListener('scroll', save, { passive: true })
    return () => canvas.removeEventListener('scroll', save)
  }, [canvasRef, active])
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (canvas && active && canvas.scrollTop !== last.current) canvas.scrollTop = last.current
  }, [canvasRef, active])
}

/**
 * Место холста страницы пространства:
 * - запоминается относительно доски при каждой прокрутке (canvasAnchor): заглушки досок ниже настоящих, и пиксели после
 *   «Назад» или перезагрузки приходились бы на другое место;
 * - «Назад», «Вперёд» и перезагрузка — доска, что была у верха, снова там же, пока доски выше догружаются;
 * - `?board=ID` (клик в дереве, новая доска, ссылка) — один раз на запись истории: доска разворачивается (личное
 *   сворачивание снимается насовсем, решение PM 3) и встаёт у верха холста. Нет её в списке, а список ещё
 *   перечитывается (доску только что создали), — ждём свежего списка.
 */
function useCanvasPlacement(
  canvasRef: RefObject<HTMLDivElement | null>,
  boards: SpaceBoard[] | undefined,
  fetching: boolean,
  page: string,
  setCollapsed: (boardId: string, collapsed: boolean) => void,
) {
  const [params] = useSearchParams()
  const focusId = params.get('board')
  const location = useLocation()
  const navigationType = useNavigationType()
  const placed = useRef<string | null>(null)
  const release = useRef<(() => void) | null>(null)
  const loaded = boards !== undefined

  // Новое удержание отменяет прежнее (два перехода подряд); уход со страницы — тоже
  const hold = useCallback((canvas: HTMLElement, boardId: string, offset: number) => {
    release.current?.()
    release.current = pinBoard(canvas, boardId, offset)
  }, [])
  useEffect(() => () => release.current?.(), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded) return
    let frame = 0
    const save = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const anchor = currentAnchor(canvas, page)
        if (anchor) rememberAnchor(location.key, anchor)
      })
    }
    canvas.addEventListener('scroll', save, { passive: true })
    return () => {
      canvas.removeEventListener('scroll', save)
      cancelAnimationFrame(frame)
    }
  }, [canvasRef, loaded, page, location.key])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !boards || placed.current === location.key) return
    const back = navigationType === 'POP' ? anchorOf(location.key, page) : undefined
    if (back) {
      placed.current = location.key
      if (boards.some((board) => board.id === back.boardId && !board.archived_at))
        requestAnimationFrame(() => hold(canvas, back.boardId, back.offset))
      return
    }
    const board = focusId
      ? boards.find((candidate) => candidate.id === focusId && !candidate.archived_at)
      : undefined
    if (focusId && !board && fetching) return
    placed.current = location.key
    if (!board || !takeFocus(location.key)) return
    if (board.collapsed) setCollapsed(board.id, false)
    // Кадр спустя — раскладка уже с развёрнутой доской
    requestAnimationFrame(() => {
      const content = canvas.firstElementChild
      const padding = content ? parseFloat(getComputedStyle(content).paddingTop) || 0 : 0
      hold(canvas, board.id, padding)
      // Фокус — на доску: следующий Tab ведёт в неё, а не к первой доске пространства (U-3 UX-ревью PR 3)
      canvas
        .querySelector<HTMLElement>(`[data-board-slot="${CSS.escape(board.id)}"]`)
        ?.focus({ preventScroll: true })
    })
  }, [canvasRef, boards, fetching, focusId, location.key, navigationType, page, setCollapsed, hold])

  /** «Назад» вернёт место по доске — пиксели useScrollMemory не восстанавливает. */
  return navigationType === 'POP' && anchorOf(location.key, page) !== undefined
}
