import type { BoardCard, BoardColumn } from '@/shared/types/api'
import { makeBoardCard } from '@/test/boards'
import { buildLayout, cellId, groupCardIds, moveCardLocally, neighboursAt } from './model'

function column(id: string, parent_id: string | null = null): BoardColumn {
  return { id, parent_id, name: id, category: 'queue', position: id }
}

function card(id: string, column_id: string, lane_id = 'l1'): BoardCard {
  return makeBoardCard({ id, column_id, lane_id, position: id, card_type_id: 't' })
}

describe('модель доски', () => {
  it('раскладывает колонки: подколонки внутри родителя, листья по порядку', () => {
    const layout = buildLayout([
      column('a'),
      column('b'),
      column('b1', 'b'),
      column('b2', 'b'),
      column('c'),
    ])

    expect(layout.groups.map((g) => [g.column.id, g.children.map((c) => c.id)])).toEqual([
      ['a', []],
      ['b', ['b1', 'b2']],
      ['c', []],
    ])
    expect(layout.leaves.map((c) => c.id)).toEqual(['a', 'b1', 'b2', 'c'])
  })

  it('группирует карточки по ячейкам с сохранением порядка', () => {
    const cells = groupCardIds([
      card('1', 'a'),
      card('2', 'b'),
      card('3', 'a'),
      card('4', 'a', 'l2'),
    ])

    expect(cells[cellId('a', 'l1')]).toEqual(['1', '3'])
    expect(cells[cellId('a', 'l2')]).toEqual(['4'])
  })

  it('соседи для сервера', () => {
    expect(neighboursAt(['x', 'y', 'z'], 1)).toEqual({ after_id: 'x', before_id: 'z' })
    expect(neighboursAt(['y'], 0)).toEqual({ after_id: null, before_id: null })
  })

  it('оптимистично перемещает карточку после соседа, перед соседом и в конец ячейки', () => {
    const cards = [card('1', 'a'), card('2', 'a'), card('3', 'b'), card('4', 'b')]
    const ids = (list: BoardCard[]) => list.map((c) => `${c.id}${c.column_id}`)

    expect(
      ids(
        moveCardLocally(cards, '1', {
          column_id: 'b',
          lane_id: 'l1',
          after_id: '3',
          before_id: '4',
        }),
      ),
    ).toEqual(['2a', '3b', '1b', '4b'])
    expect(
      ids(
        moveCardLocally(cards, '4', {
          column_id: 'a',
          lane_id: 'l1',
          after_id: null,
          before_id: '1',
        }),
      ),
    ).toEqual(['4a', '1a', '2a', '3b'])
    expect(
      ids(
        moveCardLocally(cards, '1', {
          column_id: 'b',
          lane_id: 'l1',
          after_id: null,
          before_id: null,
        }),
      ),
    ).toEqual(['2a', '3b', '4b', '1b'])
    expect(
      ids(
        moveCardLocally(cards, '3', {
          column_id: 'c',
          lane_id: 'l1',
          after_id: null,
          before_id: null,
        }),
      ),
    ).toEqual(['1a', '2a', '4b', '3c'])
  })
})
