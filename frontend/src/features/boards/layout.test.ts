import type { SpaceBoard } from '@/shared/types/api'
import {
  applyBoardMove,
  boardLayoutMoves,
  boardNaturalWidth,
  groupRows,
  layoutDropAt,
  pendingRowId,
  type LayoutGeometry,
} from './layout'

function board(id: string, row: string, overrides: Partial<SpaceBoard> = {}): SpaceBoard {
  return {
    id,
    space_id: 'space-1',
    row_id: row,
    name: id,
    description: null,
    position: 'a0',
    archived_at: null,
    leaf_columns_count: 4,
    cards_count: 0,
    collapsed: false,
    ...overrides,
  }
}

/** Раскладка списком: ряд → названия досок по порядку. */
const layout = (boards: SpaceBoard[]) =>
  groupRows(boards).map((row) => `${row.id}: ${row.boards.map((b) => b.id).join(' ')}`)

// Ряды: r1 [A, B, C], r2 [D, (X — архивная)], r3 [(Y — архивная)], r4 [E]
const boards = [
  board('A', 'r1'),
  board('B', 'r1'),
  board('C', 'r1'),
  board('D', 'r2'),
  board('X', 'r2', { archived_at: '2026-10-01T00:00:00Z' }),
  board('Y', 'r3', { archived_at: '2026-10-01T00:00:00Z' }),
  board('E', 'r4'),
]

describe('ряды досок', () => {
  it('показывает только активные доски; ряд из одних архивных не показывается', () => {
    expect(layout(boards)).toEqual(['r1: A B C', 'r2: D', 'r4: E'])
  })

  it('ширина доски — по колонкам, не уже 320 px', () => {
    // 4 колонки по 272 + 3 зазора по 8 + отступы 2×12 + граница 2
    expect(boardNaturalWidth(4)).toBe(4 * 272 + 3 * 8 + 26)
    expect(boardNaturalWidth(1)).toBe(320)
    expect(boardNaturalWidth(0)).toBe(320)
  })
})

describe('перестановка из меню', () => {
  const rows = groupRows(boards)

  it('левее, правее, в ряд выше и ниже — в конец ряда, отдельным рядом — сразу под своим', () => {
    expect(boardLayoutMoves(rows, 'B')).toEqual({
      left: { row_id: 'r1', before_id: 'A' },
      right: { row_id: 'r1', after_id: 'C' },
      rowUp: null,
      rowDown: { row_id: 'r2', after_id: 'D' },
      ownRow: { new_row_after_id: 'r1', new_row_before_id: 'r2' },
    })
    expect(boardLayoutMoves(rows, 'D')).toEqual({
      left: null,
      right: null,
      rowUp: { row_id: 'r1', after_id: 'C' },
      rowDown: { row_id: 'r4', after_id: 'E' },
      ownRow: null,
    })
    expect(boardLayoutMoves(rows, 'E').rowDown).toBeNull()
  })

  it('перенос меняет раскладку так же, как сервер; опустевший ряд пропадает', () => {
    expect(layout(applyBoardMove(boards, 'C', { row_id: 'r1', before_id: 'A' }))).toEqual([
      'r1: C A B',
      'r2: D',
      'r4: E',
    ])
    expect(layout(applyBoardMove(boards, 'E', { row_id: 'r1', after_id: 'A' }))).toEqual([
      'r1: A E B C',
      'r2: D',
    ])
    // В ряду D остаётся архивная X — ряд не пропадает, но и не показывается
    const moved = applyBoardMove(boards, 'D', { row_id: 'r4', after_id: 'E' })
    expect(layout(moved)).toEqual(['r1: A B C', 'r4: E D'])
    expect(moved.find((b) => b.id === 'X')?.row_id).toBe('r2')
  })

  it('отдельным рядом — новый ряд между соседями, в начале и в конце', () => {
    const row = pendingRowId('B')
    expect(
      layout(applyBoardMove(boards, 'B', { new_row_after_id: 'r1', new_row_before_id: 'r2' })),
    ).toEqual(['r1: A C', `${row}: B`, 'r2: D', 'r4: E'])
    expect(
      layout(applyBoardMove(boards, 'B', { new_row_after_id: null, new_row_before_id: 'r1' })),
    ).toEqual([`${row}: B`, 'r1: A C', 'r2: D', 'r4: E'])
    expect(
      layout(applyBoardMove(boards, 'B', { new_row_after_id: null, new_row_before_id: null })),
    ).toEqual(['r1: A C', 'r2: D', 'r4: E', `${row}: B`])
  })
})

describe('цель переноса доски', () => {
  // Ряды шириной 1500: r1: A [0–400], B [412–800], высота ряда 100–600; r2: C [0–1000], 612–700
  const geometry: LayoutGeometry = {
    rows: [
      {
        id: 'r1',
        top: 100,
        bottom: 600,
        left: 0,
        right: 1500,
        boards: [
          { id: 'A', left: 0, right: 400, top: 100, bottom: 600 },
          { id: 'B', left: 412, right: 800, top: 100, bottom: 400 },
        ],
      },
      {
        id: 'r2',
        top: 612,
        bottom: 700,
        left: 0,
        right: 1500,
        boards: [{ id: 'C', left: 0, right: 1000, top: 612, bottom: 700 }],
      },
    ],
  }

  it('над рядом — между досками по половинам; своё место — без запроса', () => {
    // Правее B: C (1000 px) рядом не помещается (800 + 12 + 1000 > 1500) — линия под строкой, длиной в C (U-5)
    expect(layoutDropAt({ x: 900, y: 300 }, geometry, 'C')).toEqual({
      kind: 'row',
      target: { row_id: 'r1', after_id: 'B', before_id: null },
      line: { y: 606, left: 0, right: 1000 },
    })
    expect(layoutDropAt({ x: 100, y: 300 }, geometry, 'C')?.target).toEqual({
      row_id: 'r1',
      after_id: null,
      before_id: 'A',
    })
    expect(layoutDropAt({ x: 500, y: 300 }, geometry, 'C')).toMatchObject({
      target: { row_id: 'r1', after_id: 'A', before_id: 'B' },
      line: { x: 406 },
    })
    // B правее середины A — его место и так там
    expect(layoutDropAt({ x: 300, y: 300 }, geometry, 'B')).toBeNull()
    expect(layoutDropAt({ x: 100, y: 300 }, geometry, 'B')?.target).toEqual({
      row_id: 'r1',
      after_id: null,
      before_id: 'A',
    })
  })

  it('в зазоре между рядами, над первым и под последним — отдельным рядом', () => {
    expect(layoutDropAt({ x: 50, y: 606 }, geometry, 'A')).toEqual({
      kind: 'newRow',
      target: { new_row_after_id: 'r1', new_row_before_id: 'r2' },
      line: { y: 606, left: 0, right: 1000 },
    })
    expect(layoutDropAt({ x: 50, y: 105 }, geometry, 'A')?.target).toEqual({
      new_row_after_id: null,
      new_row_before_id: 'r1',
    })
    expect(layoutDropAt({ x: 50, y: 900 }, geometry, 'A')?.target).toEqual({
      new_row_after_id: 'r2',
      new_row_before_id: null,
    })
  })

  it('одна в своём ряду: новый ряд сразу над или под ним и своё место — без запроса', () => {
    expect(layoutDropAt({ x: 50, y: 606 }, geometry, 'C')).toBeNull()
    expect(layoutDropAt({ x: 50, y: 900 }, geometry, 'C')).toBeNull()
    expect(layoutDropAt({ x: 50, y: 650 }, geometry, 'C')).toBeNull()
    expect(layoutDropAt({ x: 50, y: 105 }, geometry, 'C')?.target).toEqual({
      new_row_after_id: null,
      new_row_before_id: 'r1',
    })
  })

  it('ряд в две строки: место — в строке под указателем, порядок досок — сквозной', () => {
    // r1: строка 1 — A [0–400], B [412–800] (верх 100); строка 2 — C [0–400], D [412–800] (верх 412)
    const wrapped: LayoutGeometry = {
      rows: [
        {
          id: 'r1',
          top: 100,
          bottom: 700,
          left: 0,
          right: 1000,
          boards: [
            { id: 'A', left: 0, right: 400, top: 100, bottom: 400 },
            { id: 'B', left: 412, right: 800, top: 100, bottom: 400 },
            { id: 'C', left: 0, right: 400, top: 412, bottom: 700 },
            { id: 'D', left: 412, right: 800, top: 412, bottom: 700 },
          ],
        },
      ],
    }
    // Над правой половиной C во второй строке — между C и D (не между A и B первой строки)
    expect(layoutDropAt({ x: 300, y: 500 }, wrapped, 'A')).toMatchObject({
      target: { row_id: 'r1', after_id: 'C', before_id: 'D' },
      line: { x: 406, top: 412, bottom: 700 },
    })
    // Над левой половиной C — после B (конец первой строки) и перед C
    expect(layoutDropAt({ x: 100, y: 500 }, wrapped, 'D')?.target).toEqual({
      row_id: 'r1',
      after_id: 'B',
      before_id: 'C',
    })
    // Правее D — в конец ряда
    expect(layoutDropAt({ x: 790, y: 500 }, wrapped, 'A')?.target).toEqual({
      row_id: 'r1',
      after_id: 'D',
      before_id: null,
    })
  })

  it('линия — где доска на самом деле встанет: рядом с соседкой слева, а не поместится — под её строкой (U-5)', () => {
    // Ряд шириной 1000: строка 1 — A [0–400]; строка 2 — W [0–1000] (шире не бывает); другой ряд — N (300) и M (700)
    const geometry: LayoutGeometry = {
      rows: [
        {
          id: 'r1',
          top: 100,
          bottom: 900,
          left: 0,
          right: 1000,
          boards: [
            { id: 'A', left: 0, right: 400, top: 100, bottom: 500 },
            { id: 'W', left: 0, right: 1000, top: 512, bottom: 900 },
          ],
        },
        {
          id: 'r2',
          top: 924,
          bottom: 1200,
          left: 0,
          right: 1000,
          boards: [
            { id: 'N', left: 0, right: 300, top: 924, bottom: 1200 },
            { id: 'M', left: 312, right: 1012, top: 924, bottom: 1200 },
          ],
        },
      ],
    }
    // Над левой половиной W: N (300) помещается за A — встанет в первую строку, линия справа от A по её высоте
    expect(layoutDropAt({ x: 100, y: 700 }, geometry, 'N')).toEqual({
      kind: 'row',
      target: { row_id: 'r1', after_id: 'A', before_id: 'W' },
      line: { x: 400, top: 100, bottom: 500 },
    })
    // M (700) за A не помещается (400 + 12 + 700 > 1000) — начнёт вторую строку перед W: линия под строкой A, длиной в M
    expect(layoutDropAt({ x: 100, y: 700 }, geometry, 'M')).toEqual({
      kind: 'row',
      target: { row_id: 'r1', after_id: 'A', before_id: 'W' },
      line: { y: 506, left: 0, right: 700 },
    })
    // Правее A над первой строкой: N — рядом, вертикальная линия; M — под строкой A, длиной в M
    expect(layoutDropAt({ x: 300, y: 300 }, geometry, 'N')?.line).toEqual({
      x: 400,
      top: 100,
      bottom: 500,
    })
    expect(layoutDropAt({ x: 300, y: 300 }, geometry, 'M')?.line).toEqual({
      y: 506,
      left: 0,
      right: 700,
    })
  })
})
