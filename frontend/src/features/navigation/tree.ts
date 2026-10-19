import type { AdminNavNode, NavTreeNode } from '@/shared/types/api'

/** Пространство или папка, совпадающие с поиском, — без учёта регистра и буквы ё. */
function normalize(value: string) {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е')
}

export interface FilteredTree {
  nodes: NavTreeNode[]
  /** Узлы, раскрытые потому, что внутри них есть найденное (родительские папки, пространство найденной доски). */
  expanded: Set<string>
}

/**
 * Поиск по дереву на клиенте: по названиям папок, пространств (и ключу) и досок. Найденный элемент
 * показывается вместе с родительскими папками — они раскрыты. Найденная папка или пространство
 * показываются целиком (содержимое можно раскрыть), найденная доска — под своим пространством.
 */
export function filterTree(nodes: NavTreeNode[], query: string): FilteredTree {
  const needle = normalize(query.trim())
  const expanded = new Set<string>()
  const matches = (value: string) => normalize(value).includes(needle)

  const walk = (list: NavTreeNode[]): NavTreeNode[] =>
    list.flatMap((node): NavTreeNode[] => {
      if (node.type === 'folder') {
        if (matches(node.name)) return [node]
        const children = walk(node.children)
        if (children.length === 0) return []
        expanded.add(node.id)
        return [{ ...node, children }]
      }

      if (matches(node.space.name) || matches(node.space.key)) return [node]
      const boards = node.boards.filter((board) => matches(board.name))
      if (boards.length === 0) return []
      expanded.add(node.id)
      return [{ ...node, boards }]
    })

  return needle === '' ? { nodes, expanded } : { nodes: walk(nodes), expanded }
}

/**
 * Цепочка узлов до текущего места (пространства по ключу или доски по id) — чтобы раскрыть её
 * при переходе по ссылке. Пусто — места в дереве нет.
 */
export function pathTo(
  nodes: NavTreeNode[],
  target: { spaceKey?: string; boardId?: string },
): string[] {
  for (const node of nodes) {
    if (node.type === 'space') {
      if (target.boardId && node.boards.some((board) => board.id === target.boardId)) {
        return [node.id]
      }
      if (target.spaceKey && node.space.key === target.spaceKey) return [node.id]
      continue
    }
    const inner = pathTo(node.children, target)
    if (inner.length > 0) return [node.id, ...inner]
  }
  return []
}

/**
 * Активная часть полного дерева «Структуры»: без архивных папок (и всего, что в них) и архивных
 * пространств. Порядок обхода сохраняется.
 */
export function activeStructure(nodes: AdminNavNode[]): AdminNavNode[] {
  const hidden = new Set<string>()
  return nodes.filter((node) => {
    if (
      (node.parent_id && hidden.has(node.parent_id)) ||
      node.archived_at ||
      node.space?.archived_at
    ) {
      hidden.add(node.id)
      return false
    }
    return true
  })
}

/**
 * Строки «Структуры»: активное дерево и архивные пространства там, где они лежат (в корне или в активной
 * папке) — чтобы было видно содержимое папок. Архивные папки и всё в них — отдельным блоком.
 */
export function structureRows(nodes: AdminNavNode[]): AdminNavNode[] {
  const hidden = new Set<string>()
  return nodes.filter((node) => {
    if ((node.parent_id && hidden.has(node.parent_id)) || node.archived_at) {
      hidden.add(node.id)
      return false
    }
    return true
  })
}

/** Архивные пространства прямо в папке — их можно восстановить вместе с ней. */
export function archivedSpacesIn(nodes: AdminNavNode[], folderId: string): AdminNavNode[] {
  return nodes.filter((node) => node.parent_id === folderId && node.space?.archived_at)
}

/** Папка и все её вложенные папки (для выбора, куда переместить: в себя и вниз нельзя). */
export function descendantIds(nodes: AdminNavNode[], id: string): Set<string> {
  const result = new Set([id])
  for (const node of nodes) {
    if (node.parent_id && result.has(node.parent_id)) result.add(node.id)
  }
  return result
}

/** Высота поддерева папки по вложенным папкам: папка без вложенных — 1. */
export function folderHeight(nodes: AdminNavNode[], id: string): number {
  const ids = descendantIds(nodes, id)
  const own = nodes.find((node) => node.id === id)
  if (!own) return 1
  const deepest = Math.max(
    ...nodes.filter((node) => ids.has(node.id) && node.type === 'folder').map((node) => node.depth),
  )
  return deepest - own.depth + 1
}

/** Id всех узлов дерева пользователя (папки и пространства) — для пометки «не видно в вашем дереве». */
export function treeNodeIds(nodes: NavTreeNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (list: NavTreeNode[]) => {
    for (const node of list) {
      ids.add(node.id)
      if (node.type === 'folder') walk(node.children)
    }
  }
  walk(nodes)
  return ids
}
