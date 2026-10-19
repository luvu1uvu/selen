import type {
  BoardCard,
  BoardColumn,
  BoardDetail,
  BoardPerson,
  CardType,
  Label,
} from '@/shared/types/api'

/** Колонка первого уровня и её подколонки (если есть). */
export interface ColumnGroup {
  column: BoardColumn
  children: BoardColumn[]
}

/** Раскладка доски: группы колонок и «листовые» колонки по порядку — в них лежат карточки. */
export interface BoardLayout {
  groups: ColumnGroup[]
  leaves: BoardColumn[]
}

/**
 * Справочники для фасадов карточек — один объект на доску, чтобы мемоизированные карточки
 * не перерисовывались при каждом рендере доски.
 */
export interface BoardLookups {
  types: Map<string, CardType>
  labels: Map<string, Label>
  people: Map<string, BoardPerson>
  /** Часовой пояс пользователя и «сейчас» — для подсветки сроков. */
  timeZone: string | undefined
  now: Date
}

export function buildLookups(board: BoardDetail, timeZone: string | undefined): BoardLookups {
  return {
    types: new Map(board.card_types.map((type) => [type.id, type])),
    labels: new Map(board.labels.map((label) => [label.id, label])),
    people: new Map(board.people.map((person) => [person.id, person])),
    timeZone,
    now: new Date(),
  }
}

/** Идентификатор ячейки (колонка × дорожка) для drag-and-drop. */
export function cellId(columnId: string, laneId: string): string {
  return `${columnId}:${laneId}`
}

export function parseCellId(id: string): { columnId: string; laneId: string } {
  const [columnId, laneId] = id.split(':')
  return { columnId, laneId }
}

export function isCellId(id: string): boolean {
  return id.includes(':')
}

/** Сервер отдаёт колонки уже по порядку: колонка первого уровня, затем её подколонки. */
export function buildLayout(columns: BoardColumn[]): BoardLayout {
  const groups: ColumnGroup[] = []
  for (const column of columns) {
    if (column.parent_id === null) {
      groups.push({ column, children: [] })
    } else {
      groups.find((group) => group.column.id === column.parent_id)?.children.push(column)
    }
  }
  const leaves = groups.flatMap((group) =>
    group.children.length ? group.children : [group.column],
  )
  return { groups, leaves }
}

/** Id карточек по ячейкам, в порядке массива (сервер сортирует по позиции). */
export function groupCardIds(cards: BoardCard[]): Record<string, string[]> {
  const cells: Record<string, string[]> = {}
  for (const card of cards) {
    const id = cellId(card.column_id, card.lane_id)
    ;(cells[id] ??= []).push(card.id)
  }
  return cells
}

/** Число карточек в колонке (для колонки первого уровня — вместе с подколонками). */
export function countCards(board: BoardDetail, layout: BoardLayout): Record<string, number> {
  const counts: Record<string, number> = {}
  const parentOf = new Map(
    layout.groups.flatMap((group) => group.children.map((child) => [child.id, group.column.id])),
  )
  for (const card of board.cards) {
    counts[card.column_id] = (counts[card.column_id] ?? 0) + 1
    const parent = parentOf.get(card.column_id)
    if (parent) counts[parent] = (counts[parent] ?? 0) + 1
  }
  return counts
}

/** Соседи элемента с индексом index в списке — то, что уходит на сервер как after_id/before_id. */
export function neighboursAt(ids: string[], index: number) {
  return { after_id: ids[index - 1] ?? null, before_id: ids[index + 1] ?? null }
}

/**
 * Оптимистичное перемещение: карточка переезжает в ячейку и встаёт после after_id
 * (или перед before_id, или в конец). Возвращает новый массив карточек, исходный не меняет.
 */
export function moveCardLocally(
  cards: BoardCard[],
  cardId: string,
  target: { column_id: string; lane_id: string; after_id: string | null; before_id: string | null },
): BoardCard[] {
  const card = cards.find((c) => c.id === cardId)
  if (!card) return cards

  const moved = { ...card, column_id: target.column_id, lane_id: target.lane_id }
  const rest = cards.filter((c) => c.id !== cardId)

  let index = target.after_id ? rest.findIndex((c) => c.id === target.after_id) + 1 : -1
  if (index <= 0 && target.before_id) index = rest.findIndex((c) => c.id === target.before_id)
  if (index < 0) {
    // В конец ячейки: после последней карточки этой ячейки (или в конец массива)
    const lastInCell = rest.findLastIndex(
      (c) => c.column_id === target.column_id && c.lane_id === target.lane_id,
    )
    index = lastInCell >= 0 ? lastInCell + 1 : rest.length
  }

  return [...rest.slice(0, index), moved, ...rest.slice(index)]
}
