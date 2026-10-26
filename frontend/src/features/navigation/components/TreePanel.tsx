import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useLocation } from 'react-router'
import { FolderPlus, PanelLeftClose, Plus, Search, SquarePlus, X } from 'lucide-react'
import { AdminCompanyContext, hasCompanyPermission } from '@/features/admin/company'
import { CreateSpaceDialog } from '@/features/admin/components/CreateSpaceDialog'
import { useCurrentUser } from '@/features/auth/queries'
import { adminCompanies } from '@/shared/lib/roles'
import { usePersistentState } from '@/shared/lib/usePersistentState'
import type { NavCompanyTree, NavTreeNode, User } from '@/shared/types/api'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { TruncatedText } from '@/shared/components/TruncatedText'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { useNavigation } from '../queries'
import { filterTree, pathTo } from '../tree'
import { CreateBoardDialog } from '@/features/boards/components/CreateBoardDialog'
import { useStructureActions } from '../useStructureActions'
import { NavTree } from './NavTree'
import { TreeNodeActions } from './TreeNodeActions'

/** Где мы сейчас: пространство, доска или карточка (ключ карточки начинается с ключа пространства). */
function currentTarget(pathname: string) {
  const space =
    matchPath('/spaces/:spaceKey', pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', pathname)
  if (space) return { spaceKey: space.params.spaceKey }
  const board = matchPath('/boards/:boardId', pathname)
  if (board) return { boardId: board.params.boardId }
  const card = matchPath('/cards/:cardKey', pathname)
  if (card) return { spaceKey: card.params.cardKey?.split('-')[0] }
  return null
}

/** Ведёт ли пользователь структуру компании (папки и пространства в дереве): право компании «структура». */
function managesStructure(user: User | null | undefined, companyId: string | undefined) {
  const company = adminCompanies(user).find((item) => item.id === companyId)
  return hasCompanyPermission(company, 'company.manage_structure')
}

/**
 * «+» в корне дерева компании: папка или пространство. Диалоги — свои, в компании из `AdminCompanyContext`. Подсказка —
 * Tooltip (правило 8); у «+» в заголовках нескольких компаний в подписи — название компании (кнопки одинаковые).
 */
function RootAddMenu({ company }: { company?: string }) {
  const { t } = useTranslation('spaces')
  const structure = useStructureActions()
  const [creatingSpace, setCreatingSpace] = useState(false)

  return (
    <>
      <ActionsMenu
        label={company ? t('tree.addIn', { name: company }) : t('tree.add')}
        icon={<Plus />}
        className="size-8"
      >
        {(dialog) => (
          <>
            <DropdownMenuItem
              onSelect={dialog(() => structure.edit({ mode: 'create', parent: null }))}
            >
              <FolderPlus />
              {t('tree.addFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={dialog(() => setCreatingSpace(true))}>
              <SquarePlus />
              {t('tree.addSpace')}
            </DropdownMenuItem>
          </>
        )}
      </ActionsMenu>
      {structure.dialogs}
      <CreateSpaceDialog open={creatingSpace} onOpenChange={setCreatingSpace} parent={null} />
    </>
  )
}

/**
 * Дерево одной компании: заголовок с её названием — только если компаний несколько (ADR-0024); «+» в заголовке и «⋯»
 * строк — тому, кто ведёт её структуру; действия «Структуры» — в этой компании.
 */
function CompanyTree({
  tree,
  nodes,
  named,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  tree: NavCompanyTree
  nodes: NavTreeNode[]
  named: boolean
  isExpanded: (id: string) => boolean
  onToggle: (id: string) => void
  onNavigate: () => void
}) {
  const { data: user } = useCurrentUser()
  const manages = managesStructure(user, tree.id)
  // Создание из «+»: пространство — в папке; доска — в пространстве (ключ)
  const [creatingSpace, setCreatingSpace] = useState<{ id: string; name: string } | null>(null)
  const [creatingBoard, setCreatingBoard] = useState<string | null>(null)
  const structure = useStructureActions(manages)

  return (
    <section aria-label={tree.name ?? undefined} className="grid grid-cols-1 gap-0.5">
      {named && (
        <div className="mt-2 flex h-8 min-w-0 items-center justify-between gap-1 pl-2">
          {/* Длинное название — «…» и полностью в подсказке (правила вида, раздел 6) */}
          <TruncatedText
            as="h3"
            text={tree.name ?? ''}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          />
          {manages && <RootAddMenu company={tree.name ?? undefined} />}
        </div>
      )}
      <NavTree
        nodes={nodes}
        isExpanded={isExpanded}
        onToggle={onToggle}
        onNavigate={onNavigate}
        actions={(node, depth) => (
          <TreeNodeActions
            node={node}
            depth={depth}
            isSystemAdmin={manages}
            structure={structure}
            onAddSpace={setCreatingSpace}
            onAddBoard={setCreatingBoard}
          />
        )}
      />
      {manages && (
        <>
          {structure.dialogs}
          <CreateSpaceDialog
            open={creatingSpace !== null}
            onOpenChange={(open) => !open && setCreatingSpace(null)}
            parent={creatingSpace}
          />
        </>
      )}
      {creatingBoard && (
        <CreateBoardDialog
          key={creatingBoard}
          spaceKey={creatingBoard}
          open
          onOpenChange={(open) => !open && setCreatingBoard(null)}
        />
      )}
    </section>
  )
}

/**
 * Панель «Дерево» (docs/ui-reference/kaiten/README.md, «01 — Дерево»): заголовок и кнопка сворачивания,
 * поиск по дереву, «+» для того, кто ведёт структуру (папка или пространство), дерево папок,
 * пространств и досок. Раскрытые узлы запоминаются в браузере для каждого пользователя.
 *
 * У каждой компании своё дерево (ADR-0024): если компаний несколько — сверху каждого заголовок с названием, «+» —
 * в заголовке своей компании; компания одна — дерево как раньше, без названия, «+» — рядом с поиском.
 */
export function TreePanel({
  onCollapse,
  onNavigate,
}: {
  onCollapse: () => void
  onNavigate: () => void
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { data: user } = useCurrentUser()
  const treeQuery = useNavigation()
  const { pathname } = useLocation()
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = usePersistentState<string[]>(
    `selen.nav.expanded.${user?.id ?? 'guest'}`,
    [],
  )

  const trees = useMemo(() => treeQuery.data ?? [], [treeQuery.data])
  const named = trees.length > 1
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])
  const filtered = useMemo(
    () => trees.map((tree) => ({ tree, ...filterTree(tree.items, query) })),
    [trees, query],
  )
  const searching = query.trim() !== ''
  const found = filtered.some((item) => item.nodes.length > 0)
  // «+» рядом с поиском — когда дерево одно: в его компании; деревьев ещё нет — только если пользователь ведёт
  // структуру ровно одной компании (иначе было бы не видно, в какой компании появится папка)
  const managed = adminCompanies(user).filter((company) =>
    hasCompanyPermission(company, 'company.manage_structure'),
  )
  const rootCompany = named
    ? undefined
    : (trees[0]?.id ?? (managed.length === 1 ? managed[0].id : undefined))
  const canAddAtRoot = !!rootCompany && managesStructure(user, rootCompany)

  // Переход по ссылке на пространство или доску раскрывает путь к ней — один раз на адрес,
  // чтобы пользователь мог потом свернуть папку, не теряя места
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    const target = currentTarget(pathname)
    if (!treeQuery.isSuccess || !target || revealed.current === pathname) return
    const path = trees.map((tree) => pathTo(tree.items, target)).find((item) => item.length > 0)
    if (!path) return
    revealed.current = pathname
    setExpandedIds((previous) =>
      path.every((id) => previous.includes(id)) ? previous : [...new Set([...previous, ...path])],
    )
  }, [pathname, trees, treeQuery.isSuccess, setExpandedIds])

  const toggle = (id: string) =>
    setExpandedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  const isExpanded = (id: string) =>
    expanded.has(id) || (searching && filtered.some((item) => item.expanded.has(id)))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-base font-semibold">{t('tree.title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 md:inline-flex"
          onClick={onCollapse}
          aria-label={tc('nav.collapsePanel')}
          title={tc('nav.collapsePanel')}
        >
          <PanelLeftClose />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1 px-3 pb-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
            placeholder={t('tree.search')}
            aria-label={t('tree.searchLabel')}
            className="h-8 pr-7 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('tree.clearSearch')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {canAddAtRoot ? (
          <AdminCompanyContext.Provider value={rootCompany}>
            <RootAddMenu />
          </AdminCompanyContext.Provider>
        ) : (
          // Место «+» держим, пока дерево грузится и если «+» нет из-за нескольких деревьев: поле поиска не «прыгает»
          managed.length > 0 && <div aria-hidden className="size-8 shrink-0" />
        )}
      </div>

      <nav aria-label={t('tree.title')} className="min-h-0 flex-1 scroll-py-1 overflow-y-auto px-2 pt-1 pb-4">
        {treeQuery.isError && (
          <p className="text-destructive px-2 text-xs">{tc('errors.loadFailed')}</p>
        )}
        {treeQuery.isSuccess && trees.length === 0 && (
          <p className="text-muted-foreground px-2 text-xs">{t('tree.empty')}</p>
        )}
        {searching && !found && trees.length > 0 && (
          <p className="text-muted-foreground px-2 text-xs">{t('tree.nothingFound')}</p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {filtered
            // При поиске компании без найденного не показываются
            .filter((item) => !searching || item.nodes.length > 0)
            .map(({ tree, nodes }) => (
              <AdminCompanyContext.Provider key={tree.id} value={tree.id}>
                <CompanyTree
                  tree={tree}
                  nodes={nodes}
                  named={named}
                  isExpanded={isExpanded}
                  onToggle={toggle}
                  onNavigate={onNavigate}
                />
              </AdminCompanyContext.Provider>
            ))}
        </div>
      </nav>
    </div>
  )
}
