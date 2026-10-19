import { useCallback, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  closestCorners,
  type Collision,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { BoardCard } from '@/shared/types/api'
import { cellId, groupCardIds, isCellId, neighboursAt, parseCellId } from './model'
import type { CardMoveTarget } from './useCardMove'

type Cells = Record<string, string[]>

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
 * карточка этой ячейки, в зазоре между колонками — последняя найденная цель. С клавиатуры указателя нет —
 * ближайшие углы, как раньше.
 */
export function useBoardDnd(
  cards: BoardCard[],
  onMove: (card: BoardCard, target: CardMoveTarget) => void,
) {
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const serverCells = useMemo(() => groupCardIds(cards), [cards])
  const [dragCells, setDragCells] = useState<Cells | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const justDragged = useRef(false)
  const lastTarget = useRef<Collision[]>([])
  const cells = dragCells ?? serverCells

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointer = args.pointerCoordinates
    if (!pointer) return closestCorners(args)

    // Ячейки, в чьей вертикальной полосе указатель; из них — ближайшая по вертикали (0 — указатель внутри)
    const [cell] = args.droppableContainers
      .filter((c) => isCellId(String(c.id)))
      .flatMap((c) => {
        const rect = args.droppableRects.get(c.id)
        if (!rect || pointer.x < rect.left || pointer.x > rect.right) return []
        return [{ id: c.id, distance: Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom) }]
      })
      .sort((a, b) => a.distance - b.distance)
    if (!cell) return lastTarget.current

    const cardContainers = args.droppableContainers.filter(
      (c) => c.data.current?.sortable?.containerId === cell.id,
    )
    const [card] = closestCenter({ ...args, droppableContainers: cardContainers })
    lastTarget.current = [card ?? cell]
    return lastTarget.current
  }, [])

  const onDragStart = ({ active }: Pick<DragEvent, 'active'>) => {
    lastTarget.current = []
    setActiveId(String(active.id))
    setDragCells(serverCells)
  }

  // Состояние меняется только при смене ячейки; порядок внутри ячейки ведёт SortableContext (без setState)
  const onDragOver = ({ active, over }: DragEvent) => {
    if (!over) return
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
