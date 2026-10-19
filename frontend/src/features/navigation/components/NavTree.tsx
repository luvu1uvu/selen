import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { NavTreeNode } from '@/shared/types/api'
import { EmptyFolderMark, EveryoneMark, NodeIcon } from './NodeIcon'

const rowClass =
  'text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-sm transition-colors'
const activeClass = 'bg-accent text-foreground font-medium'

/** Отступ уровня: 12 px на уровень (глубина папок ≤ 4 — ADR-0013). */
function indent(depth: number) {
  return 4 + depth * 12
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
    />
  )
}

function Spacer() {
  return <span className="size-5 shrink-0" />
}

/**
 * Стрелка раскрытия пространства лежит поверх строки-ссылки (соседний элемент, а не вложенный:
 * кнопка внутри ссылки недопустима), поэтому подсветка текущего пространства — на всю ширину строки.
 */
function SpaceToggle({
  expanded,
  name,
  depth,
  onToggle,
}: {
  expanded: boolean
  name: string
  depth: number
  onToggle: () => void
}) {
  const { t } = useTranslation('spaces')
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? t('tree.collapse', { name }) : t('tree.expand', { name })}
      className="text-muted-foreground hover:text-foreground absolute top-1.5 flex size-5 items-center justify-center rounded"
      style={{ left: indent(depth) }}
    >
      <Chevron expanded={expanded} />
    </button>
  )
}

/**
 * Дерево навигации в стиле Kaiten (docs/ui-reference/kaiten/README.md, раздел 01): папки и пространства со
 * стрелками раскрытия, под пространством — доски. Подсветка текущего элемента — через NavLink.
 */
export function NavTree({
  nodes,
  isExpanded,
  onToggle,
  onNavigate,
  actions,
  depth = 0,
}: {
  nodes: NavTreeNode[]
  isExpanded: (id: string) => boolean
  onToggle: (id: string) => void
  onNavigate: () => void
  /** Кнопки «+» и «⋯» строки (видны при наведении и фокусе). */
  actions?: (node: NavTreeNode, depth: number) => ReactNode
  depth?: number
}) {
  return (
    <ul className="grid gap-0.5">
      {nodes.map((node) => {
        const expanded = isExpanded(node.id)
        let row: ReactNode
        let children: ReactNode = null

        if (node.type === 'folder') {
          row = (
            <div className="group/row relative">
              <button
                type="button"
                className={cn(rowClass, node.empty && 'text-muted-foreground/70')}
                style={{ paddingLeft: indent(depth) }}
                onClick={() => onToggle(node.id)}
                aria-expanded={expanded}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {/* У пустой папки (её видит только Владелец) раскрывать бывает нечего */}
                  {(!node.empty || node.children.length > 0) && <Chevron expanded={expanded} />}
                </span>
                <NodeIcon
                  kind="folder"
                  icon={node.icon}
                  className={cn(node.empty && 'opacity-50')}
                />
                {node.everyone && <EveryoneMark folder />}
                <span className="truncate">{node.name}</span>
                {node.empty && <EmptyFolderMark />}
              </button>
              {actions?.(node, depth)}
            </div>
          )
          if (expanded) {
            children = (
              <NavTree
                nodes={node.children}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onNavigate={onNavigate}
                actions={actions}
                depth={depth + 1}
              />
            )
          }
        } else {
          row = (
            <div className="group/row relative">
              <NavLink
                to={`/spaces/${node.space.key}`}
                end
                onClick={onNavigate}
                className={({ isActive }) => cn(rowClass, isActive && activeClass)}
                style={{ paddingLeft: indent(depth) }}
              >
                <Spacer />
                <NodeIcon kind="space" icon={node.icon} />
                {node.everyone && <EveryoneMark />}
                <span className="truncate">{node.space.name}</span>
              </NavLink>
              {node.boards.length > 0 && (
                <SpaceToggle
                  expanded={expanded}
                  name={node.space.name}
                  depth={depth}
                  onToggle={() => onToggle(node.id)}
                />
              )}
              {actions?.(node, depth)}
            </div>
          )
          if (expanded && node.boards.length > 0) {
            children = (
              <ul className="grid gap-0.5">
                {node.boards.map((board) => (
                  <li key={board.id}>
                    <NavLink
                      to={`/boards/${board.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) => cn(rowClass, isActive && activeClass)}
                      style={{ paddingLeft: indent(depth + 1) }}
                    >
                      <Spacer />
                      <NodeIcon kind="board" />
                      <span className="truncate">{board.name}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )
          }
        }

        return (
          <li key={node.id} className="grid gap-0.5">
            {row}
            {children}
          </li>
        )
      })}
    </ul>
  )
}
