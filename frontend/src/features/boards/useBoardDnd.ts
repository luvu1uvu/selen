import { useCallback, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  type Collision,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { BoardCard } from '@/shared/types/api'
import { cellId, groupCardIds, isCellId, neighboursAt, parseCellId } from './model'
import type { CardMoveTarget } from './useCardMove'

type Cells = Record<string, string[]>

/**
 * «Цели нет»: указатель над строкой свёрнутой дорожки. Такой зоны среди droppable нет, поэтому dnd-kit сообщает
 * over = null — карточка возвращается на своё место, бросок отменяется.
 */
const NO_TARGET: Collision[] = [{ id: 'collapsed-lane' }]

/** Минимум полей событий dnd-kit, нужный логике (удобно и для тестов). */
interface DragEvent {
  active: { id: UniqueIdentifier }
  over: { id: UniqueIdentifier } | null
}

function findCell(id: string, cells: Cells): string | undefined {
  return isCellId(id) ? id : Object.keys(cells).find((key) => cells[key].includes(id))
}

/** Карточка в чужой ячейке встаёт перед карточкой под указателем, над пустым местом ячейки — в конец. */
function insertBefore(ids: string[], cardId: string, overId: string): string[] {
  const overIndex = isCellId(overId) ? -1 : ids.indexOf(overId)
  const result = [...ids]
  result.splice(overIndex < 0 ? result.length : overIndex, 0, cardId)
  return result
}

/**
 * Логика перетаскивания карточек по доске (без привязки к DOM):
 * - пока карточку тянут, порядок по ячейкам держится в локальном состоянии;
 * - при отпускании вычисляются соседи в целевой ячейке и вызывается onMove (оптимистичное перемещение);
 * - если карточка вернулась на своё место — запроса нет;
 * - клик сразу после перетаскивания карточку не открывает.
 *
 * Цель перетаскивания (collisionDetection): ячейку выбирает УКАЗАТЕЛЬ, а не прямоугольники карточек. Перенос
 * карточки в другую ячейку сдвигает карточки обеих колонок; при поиске «ближайших углов» ближайшей после сдвига
 * становилась карточка прежней колонки — карточка металась между колонками каждый кадр, обновляя состояние,
 * пока React не падал (Maximum update depth exceeded). Положение указателя от сдвигов раскладки не зависит:
 * колонка — та, в чьей вертикальной полосе указатель (и над карточками, и над заголовком), дорожка — ближайшая
 * по вертикали; перенос карточки эти границы не сдвигает в сторону другой цели. Внутри ячейки — ближайшая
 * карточка этой ячейки, в зазоре между колонками — последняя найденная цель. С клавиатуры указателя нет — его роль
 * играет центр переносимой карточки: по «ближайшим углам» высокая пустая ячейка соседней колонки проигрывала
 * карточкам своей, и карточка из низа длинной колонки не переносилась вбок.
 *
 * Свёрнутая дорожка бросок не принимает (ADR-0019): ячеек у неё нет, а над её строкой (isOverCollapsedLane) цели нет
 * вовсе — иначе карточка ушла бы в соседнюю по вертикали дорожку. Карточка тогда показана на своём месте, отпускание
 * ничего не меняет.
 */
export function useBoardDnd(
  cards: BoardCard[],
  onMove: (card: BoardCard, target: CardMoveTarget) => void,
  isOverCollapsedLane?: (point: { x: number; y: number }) => boolean,
) {
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const serverCells = useMemo(() => groupCardIds(cards), [cards])
  const [dragCells, setDragCells] = useState<Cells | null>(null)
  // Раскладка сразу после броска — пока в доску не пришли новые данные. Кеш TanStack Query меняется синхронно, но
  // компонент узнаёт об этом на следующем такте: без неё карточка на кадр рисовалась на старом месте, и анимация
  // броска dnd-kit прокручивала доску к нему, за край экрана (LATER-63)
  const [dropped, setDropped] = useState<{ cells: Cells; server: Cells } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const justDragged = useRef(false)
  const lastTarget = useRef<Collision[]>([])
  const cells =
    dragCells ?? (dropped && dropped.server === serverCells ? dropped.cells : serverCells)

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const box = args.collisionRect
      const pointer = args.pointerCoordinates ?? {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      }
      if (isOverCollapsedLane?.(pointer)) {
        lastTarget.current = NO_TARGET
        return NO_TARGET
      }

      // Ячейки, в чьей вертикальной полосе указатель; из них — ближайшая по вертикали (0 — указатель внутри)
      const [cell] = args.droppableContainers
        .filter((c) => isCellId(String(c.id)))
        .flatMap((c) => {
          const rect = args.droppableRects.get(c.id)
          if (!rect || pointer.x < rect.left || pointer.x > rect.right) return []
          return [
            { id: c.id, distance: Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom) },
          ]
        })
        .sort((a, b) => a.distance - b.distance)
      if (!cell) return lastTarget.current

      const cardContainers = args.droppableContainers.filter(
        (c) => c.data.current?.sortable?.containerId === cell.id,
      )
      const [card] = closestCenter({ ...args, droppableContainers: cardContainers })
      lastTarget.current = [card ?? cell]
      return lastTarget.current
    },
    [isOverCollapsedLane],
  )

  const onDragStart = ({ active }: Pick<DragEvent, 'active'>) => {
    lastTarget.current = []
    setActiveId(String(active.id))
    setDropped(null)
    setDragCells(serverCells)
  }

  // Состояние меняется только при смене ячейки; порядок внутри ячейки ведёт SortableContext (без setState).
  // Цели нет (над свёрнутой дорожкой) — карточка на своём месте
  const onDragOver = ({ active, over }: DragEvent) => {
    if (!over) return setDragCells(serverCells)
    setDragCells((previous) => {
      const current = previous ?? serverCells
      const from = findCell(String(active.id), current)
      const to = findCell(String(over.id), current)
      if (!from || !to || from === to) return current

      return {
        ...current,
        [from]: current[from].filter((id) => id !== active.id),
        [to]: insertBefore(current[to] ?? [], String(active.id), String(over.id)),
      }
    })
  }

  const finish = () => {
    setActiveId(null)
    setDragCells(null)
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 0)
  }

  const onDragEnd = ({ active, over }: DragEvent) => {
    const current = dragCells ?? serverCells
    const card = cardsById.get(String(active.id))
    const to = over ? findCell(String(over.id), current) : undefined
    if (!card || !over || !to) return finish()

    let ids = current[to] ?? []
    if (!ids.includes(card.id)) {
      // Отпустили раньше, чем отрисовался переход в эту ячейку (onDragOver ещё не применён), — без этого
      // перемещение терялось и карточка возвращалась на место
      ids = insertBefore(ids, card.id, String(over.id))
    } else if (!isCellId(String(over.id)) && over.id !== active.id) {
      ids = arrayMove(ids, ids.indexOf(card.id), ids.indexOf(String(over.id)))
    }
    const index = ids.indexOf(card.id)
    const from = cellId(card.column_id, card.lane_id)
    const unchanged = from === to && (serverCells[from] ?? []).indexOf(card.id) === index

    if (!unchanged && index >= 0) {
      const { columnId, laneId } = parseCellId(to)
      setDropped({
        cells: {
          ...current,
          [from]: (current[from] ?? []).filter((id) => id !== card.id),
          [to]: ids,
        },
        server: serverCells,
      })
      onMove(card, { column_id: columnId, lane_id: laneId, ...neighboursAt(ids, index) })
    }
    finish()
  }

  /** Обёртка над открытием карточки: игнорирует клик, завершающий перетаскивание. */
  const guardClick = useCallback(
    (open: (key: string) => void) => (key: string) => {
      if (!justDragged.current) open(key)
    },
    [],
  )

  return {
    cells,
    cardsById,
    activeCard: activeId ? cardsById.get(activeId) : undefined,
    guardClick,
    collisionDetection,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: finish },
  }
}

/** Расстояние по вертикали от точки до прямоугольника (0 — точка на его высоте). */
function verticalDistance(rect: { top: number; bottom: number }, y: number) {
  return Math.max(rect.top - y, 0, y - rect.bottom)
}

/**
 * Перенос с клавиатуры (стрелки). Вверх и вниз — как в dnd-kit (`sortableKeyboardCoordinates`). Влево и вправо —
 * в соседнюю колонку по полосам колонок, на той же высоте: к ближайшей по вертикали карточке ячейки, а в пустой
 * ячейке — на текущей высоте. Стандартный расчёт выбирал цель «правее» по левому краю наложения, а наложение
 * повёрнуто (rotate-2) и чуть левее карточки — первое нажатие уводило к соседней карточке своей же колонки;
 * в пустую высокую ячейку карточка прыгала к началу колонки, за край экрана.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const right = event.code === 'ArrowRight'
  if (!right && event.code !== 'ArrowLeft') return sortableKeyboardCoordinates(event, args)
  event.preventDefault()

  const { active, collisionRect, droppableRects, droppableContainers } = args.context
  if (!active || !collisionRect) return undefined
  const x = collisionRect.left + collisionRect.width / 2
  const y = collisionRect.top + collisionRect.height / 2
  const enabled = droppableContainers.getEnabled()

  // Ячейки по ту сторону от центра карточки; из них — ближайшая колонка, в ней — ближайшая по вертикали дорожка
  const cells = enabled.flatMap((container) => {
    const rect = droppableRects.get(container.id)
    if (!rect || !isCellId(String(container.id))) return []
    const gap = right ? rect.left - x : x - rect.right
    return gap > 0 ? [{ id: container.id, rect, gap }] : []
  })
  if (cells.length === 0) return undefined
  const nearestGap = Math.min(...cells.map((cell) => cell.gap))
  const [cell] = cells
    .filter((candidate) => candidate.gap === nearestGap)
    .sort((a, b) => verticalDistance(a.rect, y) - verticalDistance(b.rect, y))

  const [card] = enabled
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      const inCell = container.data.current?.sortable?.containerId === cell.id
      return rect && inCell && container.id !== active.id ? [rect] : []
    })
    .sort((a, b) => verticalDistance(a, y) - verticalDistance(b, y))
  if (card) return { x: card.left, y: card.top }

  const lowest = Math.max(cell.rect.top, cell.rect.bottom - collisionRect.height)
  return { x: cell.rect.left, y: Math.min(Math.max(collisionRect.top, cell.rect.top), lowest) }
}
