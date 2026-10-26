import { useRef, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, useLocation, useSearchParams } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { TruncatedTrigger } from '@/shared/components/TruncatedText'
import { cn } from '@/shared/lib/utils'
import type { NavTreeNode } from '@/shared/types/api'
import { EmptyFolderMark, EveryoneMark, NodeIcon } from './NodeIcon'

// Подсветка при наведении — и когда указатель над значком или стрелкой поверх строки (`group/row`)
const rowClass =
  'text-muted-foreground hover:bg-accent hover:text-foreground group-hover/row:bg-accent group-hover/row:text-foreground flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-sm transition-colors'
// Выбранная строка — подложка selected и полоска акцента 2 px слева (заливка к фону дерева меньше 3:1 — нужен признак
// формы), font-medium; при наведении остаётся выбранной, наведение отличается от выбранного
const activeClass =
  'bg-selected hover:bg-selected group-hover/row:bg-selected text-foreground font-medium shadow-[inset_2px_0_0_var(--primary)]'
// Список дерева — одна колонка minmax(0, 1fr): у колонки `auto` ширину задаёт самое длинное название строки, и дерево
// прокручивалось вбок вместо «…» (LATER-109)
const listClass = 'grid grid-cols-1 gap-0.5'

/** Отступ уровня: 12 px на уровень (глубина папок ≤ 4 — ADR-0013). */
function indent(depth: number) {
  return 4 + depth * 12
}

/** Где в строке значок «доступно всем»: после стрелки (20 px), значка узла (16 px) и двух зазоров по 6 px. */
function markLeft(depth: number) {
  return indent(depth) + 20 + 6 + 16 + 6
}

/**
 * Пометка «пустая» — левее места «+» и «⋯» (кнопки 2 × 24 px и зазоры — 54 px от края строки): поверх неё кнопки
 * перехватывали бы указатель (они есть всегда, когда видна пустая папка, — её видит только Владелец), и подсказку было бы
 * не открыть мышью.
 */
const EMPTY_MARK_RIGHT = 58

/**
 * Значки с подсказкой (LATER-88) получают фокус, а внутри ссылки или кнопки фокусируемое недопустимо: в строке на их
 * месте — пустое место той же ширины, сами значки — поверх строки рядом (как стрелка пространства).
 */
function MarkSpace() {
  return <span aria-hidden className="size-3.5 shrink-0" />
}

/**
 * Щелчок по значку поверх строки — как по самой строке (ссылке или кнопке — первый элемент строки): значок не должен
 * быть «мёртвой зоной» посреди строки.
 */
function clickRow(event: MouseEvent<HTMLElement>) {
  ;(event.currentTarget.parentElement?.firstElementChild as HTMLElement | null)?.click()
}

/**
 * Название строки в одну строку с «…»; обрезанное — полностью в подсказке у самой строки (ссылки или кнопки), по
 * наведению и по фокусу (LATER-109, `TruncatedTrigger`).
 */
function RowName({
  name,
  children,
}: {
  name: string
  children: (nameElement: ReactNode) => ReactElement
}) {
  const ref = useRef<HTMLSpanElement>(null)
  return (
    <TruncatedTrigger text={name} nameRef={ref}>
      {children(
        <span ref={ref} className="truncate">
          {name}
        </span>,
      )}
    </TruncatedTrigger>
  )
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
 * Что сейчас открыто: пространство (с карточкой поверх — тоже) и доска — `?board=ID` на странице пространства или
 * страница одной доски. Открыта доска — подсвечена она, а не пространство.
 */
function useCurrentPlace() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const space =
    matchPath('/spaces/:spaceKey', pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', pathname)
  const board = matchPath('/boards/:boardId', pathname)
  const boardId = board?.params.boardId ?? (space ? params.get('board') : null)
  return { spaceKey: boardId ? undefined : space?.params.spaceKey, boardId }
}

/**
 * Дерево навигации в стиле Kaiten (docs/ui-reference/kaiten/README.md, раздел 01): папки и пространства со
 * стрелками раскрытия, под пространством — доски. Доска открывается на странице пространства — среди остальных
 * его досок, холст прокручивается к ней (`/spaces/KEY?board=ID`, ADR-0019). Подсвечен открытый элемент.
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
  const { t } = useTranslation('spaces')
  const current = useCurrentPlace()
  return (
    <ul className={listClass}>
      {nodes.map((node) => {
        const expanded = isExpanded(node.id)
        let row: ReactNode
        let children: ReactNode = null

        if (node.type === 'folder') {
          row = (
            <div className="group/row relative">
              <RowName name={node.name}>
                {(name) => (
                  <button
                    type="button"
                    className={rowClass}
                    style={{
                      paddingLeft: indent(depth),
                      paddingRight: node.empty ? EMPTY_MARK_RIGHT : undefined,
                    }}
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
                    {node.everyone && <MarkSpace />}
                    {name}
                    {/* Место пометки «пустая» в конце строки: сама пометка (с фокусом) — поверх, рядом с кнопкой */}
                    {node.empty && (
                      <span aria-hidden className="invisible ml-auto shrink-0 text-xs">
                        {t('tree.emptyFolder')}
                      </span>
                    )}
                  </button>
                )}
              </RowName>
              {node.everyone && (
                <EveryoneMark
                  folder
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: markLeft(depth) }}
                  onClick={clickRow}
                />
              )}
              {node.empty && (
                <EmptyFolderMark
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ right: EMPTY_MARK_RIGHT }}
                  onClick={clickRow}
                />
              )}
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
              <RowName name={node.space.name}>
                {(name) => (
                  <Link
                    to={`/spaces/${node.space.key}`}
                    onClick={onNavigate}
                    aria-current={current.spaceKey === node.space.key ? 'page' : undefined}
                    className={cn(rowClass, current.spaceKey === node.space.key && activeClass)}
                    style={{ paddingLeft: indent(depth) }}
                  >
                    <Spacer />
                    <NodeIcon kind="space" icon={node.icon} />
                    {node.everyone && <MarkSpace />}
                    {name}
                  </Link>
                )}
              </RowName>
              {/* Стрелка — раньше значка: порядок Tab как на экране (U-4 UX-ревью пачки UX-2) */}
              {node.boards.length > 0 && (
                <SpaceToggle
                  expanded={expanded}
                  name={node.space.name}
                  depth={depth}
                  onToggle={() => onToggle(node.id)}
                />
              )}
              {node.everyone && (
                <EveryoneMark
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: markLeft(depth) }}
                  onClick={clickRow}
                />
              )}
              {actions?.(node, depth)}
            </div>
          )
          if (expanded && node.boards.length > 0) {
            children = (
              <ul className={listClass}>
                {node.boards.map((board) => (
                  <li key={board.id} className="group/row">
                    <RowName name={board.name}>
                      {(name) => (
                        <Link
                          to={`/spaces/${node.space.key}?board=${board.id}`}
                          onClick={onNavigate}
                          aria-current={current.boardId === board.id ? 'page' : undefined}
                          className={cn(rowClass, current.boardId === board.id && activeClass)}
                          style={{ paddingLeft: indent(depth + 1) }}
                        >
                          <Spacer />
                          <NodeIcon kind="board" />
                          {name}
                        </Link>
                      )}
                    </RowName>
                  </li>
                ))}
              </ul>
            )
          }
        }

        return (
          <li key={node.id} className={listClass}>
            {row}
            {children}
          </li>
        )
      })}
    </ul>
  )
}
