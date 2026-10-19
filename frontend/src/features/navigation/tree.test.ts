import type { AdminNavNode, NavTreeNode } from '@/shared/types/api'
import { activeStructure, descendantIds, filterTree, folderHeight, pathTo } from './tree'

const space = (key: string, name: string, boards: { id: string; name: string }[] = []) =>
  ({
    type: 'space',
    id: `node-${key}`,
    icon: null,
    everyone: false,
    space: { id: `s-${key}`, key, name },
    can_manage: false,
    boards,
  }) satisfies NavTreeNode

const tree: NavTreeNode[] = [
  {
    type: 'folder',
    id: 'f-mobile',
    name: 'Mobile',
    icon: '📱',
    everyone: false,
    empty: false,
    children: [
      space('IOS', 'iOS', [{ id: 'b-ios', name: 'Релизы iOS' }]),
      {
        type: 'folder',
        id: 'f-store',
        name: 'Магазины',
        icon: null,
        everyone: false,
        empty: false,
        children: [space('ANDR', 'Android', [{ id: 'b-play', name: 'Ёлка релизов' }])],
      },
    ],
  },
  space('BACK', 'Backend', [{ id: 'b-api', name: 'API' }]),
]

const names = (nodes: NavTreeNode[]): string[] =>
  nodes.flatMap((node) =>
    node.type === 'folder'
      ? [node.name, ...names(node.children)]
      : [node.space.name, ...node.boards.map((board) => board.name)],
  )

describe('Поиск по дереву', () => {
  it('пустой запрос — дерево без изменений, ничего не раскрыто', () => {
    const result = filterTree(tree, '  ')
    expect(result.nodes).toBe(tree)
    expect(result.expanded.size).toBe(0)
  })

  it('доска находится по части названия вместе с пространством и родительскими папками', () => {
    const result = filterTree(tree, 'елка')
    expect(names(result.nodes)).toEqual(['Mobile', 'Магазины', 'Android', 'Ёлка релизов'])
    expect([...result.expanded].sort()).toEqual(['f-mobile', 'f-store', 'node-ANDR'])
  })

  it('пространство находится по названию и по ключу, без регистра, целиком с досками', () => {
    expect(names(filterTree(tree, 'IOS').nodes)).toEqual(['Mobile', 'iOS', 'Релизы iOS'])
    expect(names(filterTree(tree, 'back').nodes)).toEqual(['Backend', 'API'])
    const byKey = filterTree(tree, 'andr')
    expect(names(byKey.nodes)).toEqual(['Mobile', 'Магазины', 'Android', 'Ёлка релизов'])
    // Найденное пространство не раскрывается само — только путь к нему
    expect(byKey.expanded.has('node-ANDR')).toBe(false)
  })

  it('найденная папка показывается целиком', () => {
    const result = filterTree(tree, 'магаз')
    expect(names(result.nodes)).toEqual(['Mobile', 'Магазины', 'Android', 'Ёлка релизов'])
    expect([...result.expanded]).toEqual(['f-mobile'])
  })

  it('ничего не найдено — пустое дерево', () => {
    expect(filterTree(tree, 'маркетинг').nodes).toEqual([])
  })
})

describe('Путь к текущему месту', () => {
  it('пространство и доска — цепочка папок до узла пространства', () => {
    expect(pathTo(tree, { spaceKey: 'ANDR' })).toEqual(['f-mobile', 'f-store', 'node-ANDR'])
    expect(pathTo(tree, { boardId: 'b-ios' })).toEqual(['f-mobile', 'node-IOS'])
    expect(pathTo(tree, { spaceKey: 'BACK' })).toEqual(['node-BACK'])
  })

  it('места нет в дереве — пусто', () => {
    expect(pathTo(tree, { spaceKey: 'OPS' })).toEqual([])
  })
})

const node = (overrides: Partial<AdminNavNode> & Pick<AdminNavNode, 'id'>): AdminNavNode => ({
  parent_id: null,
  type: 'folder',
  name: overrides.id,
  icon: null,
  depth: 1,
  archived_at: null,
  everyone: false,
  space: null,
  ...overrides,
})

const structure: AdminNavNode[] = [
  node({ id: 'a' }),
  node({ id: 'a1', parent_id: 'a', depth: 2 }),
  node({ id: 'a11', parent_id: 'a1', depth: 3 }),
  node({
    id: 's1',
    parent_id: 'a11',
    depth: 4,
    type: 'space',
    name: null,
    space: { id: 's1', key: 'ONE', name: 'One', archived_at: null },
  }),
  node({ id: 'old', archived_at: '2026-10-01T00:00:00Z' }),
  node({ id: 'old-child', parent_id: 'old', depth: 2 }),
  node({
    id: 's2',
    type: 'space',
    name: null,
    space: { id: 's2', key: 'TWO', name: 'Two', archived_at: '2026-10-01T00:00:00Z' },
  }),
]

describe('«Структура»: вспомогательные функции', () => {
  it('активная часть — без архивных папок, их содержимого и архивных пространств', () => {
    expect(activeStructure(structure).map((item) => item.id)).toEqual(['a', 'a1', 'a11', 's1'])
  })

  it('потомки папки включают её саму и всё вложенное', () => {
    expect([...descendantIds(structure, 'a1')]).toEqual(['a1', 'a11', 's1'])
  })

  it('высота папки считается по вложенным папкам', () => {
    expect(folderHeight(structure, 'a')).toBe(3)
    expect(folderHeight(structure, 'a11')).toBe(1)
    expect(folderHeight(structure, 'missing')).toBe(1)
  })
})
