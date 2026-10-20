import type { SpaceBoard } from '@/shared/types/api'
import type { BoardMoveTarget } from './api'

/**
 * Раскладка досок на странице пространства (ADR-0019): в ряду доски стоят рядом, ряды — друг под другом. Список досок
 * с сервера уже в порядке раскладки (ряд, затем место в ряду), в нём и архивные доски — они держат своё место в ряду.
 */
export interface BoardRowView {
  id: string
  /** Активные доски ряда по порядку. */
  boards: SpaceBoard[]
}

/** Ряды всех досок (и архивных) по порядку — как в списке с сервера. */
function groupAll(boards: SpaceBoard[]): BoardRowView[] {
  const rows: BoardRowView[] = []
  for (const board of boards) {
    const last = rows.at(-1)
    if (last?.id === board.row_id) last.boards.push(board)
    else rows.push({ id: board.row_id, boards: [board] })
  }
  return rows
}

/** Ряды на странице: только активные доски; ряд, где остались одни архивные, не показывается. */
export function groupRows(boards: SpaceBoard[]): BoardRowView[] {
  return groupAll(boards)
    .map((row) => ({ id: row.id, boards: row.boards.filter((board) => !board.archived_at) }))
    .filter((row) => row.boards.length > 0)
}

/** Колонка доски — w-68 (BoardView), зазор между колонками — gap-2. */
const COLUMN_PX = 272
const COLUMN_GAP_PX = 8
/** Отступы блока слева и справа (px-3) и его граница (1 px с каждой стороны). */
const BLOCK_EDGES_PX = 2 * 12 + 2
/** Блок доски не уже 20rem: шапка с названием и кнопками не ломается и при одной колонке (ADR-0019). */
export const BOARD_MIN_WIDTH_PX = 320

/**
 * Ширина доски по её колонкам, без загрузки карточек: колонки, зазоры между ними, отступы и граница блока — ровно
 * как у BoardView. Не уже минимальной ширины блока. Нужна заглушке до загрузки доски и ряду: широкая доска
 * сжимается до остатка ряда, узкая — нет.
 */
export function boardNaturalWidth(leafColumns: number): number {
  if (leafColumns <= 0) return BOARD_MIN_WIDTH_PX
  const columns = leafColumns * COLUMN_PX + (leafColumns - 1) * COLUMN_GAP_PX
  return Math.max(columns + BLOCK_EDGES_PX, BOARD_MIN_WIDTH_PX)
}

/** Зазор между досками ряда — gap-3 холста. */
const BOARD_GAP_PX = 12

/**
 * Колонки сетки ряда (CSS grid): у каждой доски — от своей минимальной ширины до ширины по колонкам. Сетка раздаёт
 * свободное место поровну, пока доска не дорастёт до своей ширины (алгоритм grid «maximize tracks»): узкие доски — целиком,
 * широкие делят остаток ряда поровну и прокручиваются вбок внутри блока. Минимум — 20rem, но не больше равной доли
 * ряда: много досок в ряду не вылезают за край холста. Свёрнутая — по своей шапке. С `flex: 0 1 ширина` (первый
 * вариант плана) сжимались все доски ряда пропорционально, и двухколоночная рядом с широкой уходила в 20rem.
 */
export function rowTemplate(row: BoardRowView): string {
  const n = row.boards.length
  const share = `calc((100% - ${(n - 1) * BOARD_GAP_PX}px) / ${n})`
  return row.boards
    .map((board) => {
      if (board.collapsed) return 'max-content'
      const width = boardNaturalWidth(board.leaf_columns_count)
      return `minmax(min(${width}px, 20rem, ${share}), ${width}px)`
    })
    .join(' ')
}

/** Блок доски не ниже 15rem (ADR-0019). */
const BOARD_MIN_HEIGHT_PX = 240
/** Шапка (48) и строка заголовков колонок (52) доски. */
const BOARD_HEADERS_PX = 100
/** Самая низкая карточка (номер и название в одну строку) с зазором до следующей — gap-2. */
const MIN_CARD_PX = 86

/**
 * Высота заглушки доски, которая ещё не загружена, — оценка снизу по числу карточек: в самой длинной колонке не
 * меньше карточек, чем в среднем, и каждая не ниже самой низкой. Без неё все заглушки (по 15rem) оказывались рядом
 * с экраном, и холст сразу загружал все доски пространства (ленивая загрузка, ADR-0019, «Производительность»).
 */
export function boardEstimatedHeight(leafColumns: number, cards: number): number {
  if (leafColumns <= 0 || cards <= 0) return BOARD_MIN_HEIGHT_PX
  return Math.max(
    BOARD_HEADERS_PX + Math.ceil(cards / leafColumns) * MIN_CARD_PX,
    BOARD_MIN_HEIGHT_PX,
  )
}

/** Перестановки доски из меню «⋯» (с клавиатуры): null — пункт недоступен. */
export interface BoardLayoutMoves {
  left: BoardMoveTarget | null
  right: BoardMoveTarget | null
  rowUp: BoardMoveTarget | null
  rowDown: BoardMoveTarget | null
  ownRow: BoardMoveTarget | null
}

/**
 * Пункты меню «Левее», «Правее», «В ряд выше», «В ряд ниже» (в конец того ряда), «Отдельным рядом» (новый ряд сразу
 * под своим) — по рядам, которые видит пользователь.
 */
export function boardLayoutMoves(rows: BoardRowView[], boardId: string): BoardLayoutMoves {
  const r = rows.findIndex((row) => row.boards.some((board) => board.id === boardId))
  const none = { left: null, right: null, rowUp: null, rowDown: null, ownRow: null }
  if (r < 0) return none
  const row = rows[r]
  const i = row.boards.findIndex((board) => board.id === boardId)
  const above = rows[r - 1]
  const below = rows[r + 1]
  return {
    left: i > 0 ? { row_id: row.id, before_id: row.boards[i - 1].id } : null,
    right: i < row.boards.length - 1 ? { row_id: row.id, after_id: row.boards[i + 1].id } : null,
    rowUp: above ? { row_id: above.id, after_id: above.boards.at(-1)!.id } : null,
    rowDown: below ? { row_id: below.id, after_id: below.boards.at(-1)!.id } : null,
    ownRow:
      row.boards.length > 1
        ? { new_row_after_id: row.id, new_row_before_id: below?.id ?? null }
        : null,
  }
}

/** Временный ряд до ответа сервера (оптимистичный перенос отдельным рядом). */
export const pendingRowId = (boardId: string) => `pending-row:${boardId}`

/**
 * Список досок после переноса — для оптимистичного обновления кеша, пока сервер не ответил (порядок раскладки
 * сохраняется: ряды по порядку, в ряду — доски по порядку). Новый ряд получает временный id. Ряд, где не осталось
 * ни одной доски, пропадает — как на сервере.
 */
export function applyBoardMove(
  boards: SpaceBoard[],
  boardId: string,
  target: BoardMoveTarget,
): SpaceBoard[] {
  const moved = boards.find((board) => board.id === boardId)
  if (!moved) return boards
  const rows = groupAll(boards.filter((board) => board.id !== boardId))

  if ('row_id' in target) {
    const row = rows.find((candidate) => candidate.id === target.row_id)
    if (!row) return boards
    const ids = row.boards.map((board) => board.id)
    const after = target.after_id ? ids.indexOf(target.after_id) : -1
    const before = target.before_id ? ids.indexOf(target.before_id) : -1
    const at = after >= 0 ? after + 1 : before >= 0 ? before : ids.length
    row.boards.splice(at, 0, { ...moved, row_id: row.id })
  } else {
    const after = target.new_row_after_id
      ? rows.findIndex((row) => row.id === target.new_row_after_id)
      : -1
    const before = target.new_row_before_id
      ? rows.findIndex((row) => row.id === target.new_row_before_id)
      : -1
    // Как на сервере: после ряда-соседа, иначе перед другим соседом, иначе в конец
    const at = after >= 0 ? after + 1 : before >= 0 ? before : rows.length
    const id = pendingRowId(boardId)
    rows.splice(at, 0, { id, boards: [{ ...moved, row_id: id }] })
  }

  return rows.flatMap((row) => row.boards)
}

/** Где доски на экране во время переноса (координаты окна): ряды сверху вниз, в ряду — доски слева направо. */
export interface LayoutGeometry {
  rows: {
    id: string
    top: number
    bottom: number
    boards: { id: string; left: number; right: number }[]
  }[]
}

/**
 * Куда упадёт доска и где нарисовать линию-указатель: в ряд — вертикальная линия между досками (x, от top до bottom),
 * отдельным рядом — горизонтальная линия между рядами (y, от left до right).
 */
export type LayoutDrop =
  | {
      kind: 'row'
      target: BoardMoveTarget
      line: { x: number; top: number; bottom: number }
    }
  | {
      kind: 'newRow'
      target: BoardMoveTarget
      line: { y: number; left: number; right: number }
    }

/**
 * Полоса у края ряда, где перенос означает «отдельным рядом»: зазор между рядами и эта полоса сверху следующего ряда
 * (верх шапок), а снизу предыдущего — половина её (низ самой высокой доски редко бывает целью).
 */
const NEW_ROW_EDGE_PX = 16

/**
 * Цель переноса доски по указателю (как у карточек, цель выбирает указатель, а не прямоугольники: раскладка во время
 * переноса не перестраивается, поэтому «пинг-понга» из ловушки dnd-kit нет). Над рядом — между досками ряда (левее
 * или правее той, над чьей половиной указатель); в зазоре между рядами, над первым и под последним — новый ряд.
 * Перенос туда, где доска и так стоит, — null (запроса не будет).
 */
export function layoutDropAt(
  point: { x: number; y: number },
  geometry: LayoutGeometry,
  boardId: string,
): LayoutDrop | null {
  const { rows } = geometry
  if (rows.length === 0) return null
  const left = Math.min(...rows.flatMap((row) => row.boards.map((board) => board.left)))
  const right = Math.max(...rows.flatMap((row) => row.boards.map((board) => board.right)))
  const own = rows.findIndex((row) => row.boards.some((board) => board.id === boardId))
  const alone = own >= 0 && rows[own].boards.length === 1

  const newRow = (index: number, y: number): LayoutDrop | null => {
    // Одна в своём ряду — новый ряд сразу над или под ним ничего не меняет
    if (alone && (index === own || index === own + 1)) return null
    return {
      kind: 'newRow',
      target: {
        new_row_after_id: rows[index - 1]?.id ?? null,
        new_row_before_id: rows[index]?.id ?? null,
      },
      line: { y, left, right },
    }
  }

  if (point.y < rows[0].top + NEW_ROW_EDGE_PX) return newRow(0, rows[0].top)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const next = rows[r + 1]
    if (point.y >= row.bottom - NEW_ROW_EDGE_PX / 2) {
      if (!next) return newRow(r + 1, row.bottom)
      if (point.y < next.top + NEW_ROW_EDGE_PX) return newRow(r + 1, (row.bottom + next.top) / 2)
      continue
    }

    const others = row.boards.filter((board) => board.id !== boardId)
    const at = others.filter((board) => (board.left + board.right) / 2 < point.x).length
    const after = others[at - 1]
    const before = others[at]
    // Своё же место: слева тот же сосед, что и сейчас (одна в ряду — соседей нет вовсе)
    if (r === own) {
      const ids = row.boards.map((board) => board.id)
      if ((ids[ids.indexOf(boardId) - 1] ?? null) === (after?.id ?? null)) return null
    }
    if (!after && !before) return null
    const x = after && before ? (after.right + before.left) / 2 : after ? after.right : before!.left
    return {
      kind: 'row',
      target: { row_id: row.id, after_id: after?.id ?? null, before_id: before?.id ?? null },
      line: { x, top: row.top, bottom: row.bottom },
    }
  }
  return null
}
