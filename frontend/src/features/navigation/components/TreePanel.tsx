import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useLocation } from 'react-router'
import { FolderPlus, PanelLeftClose, Plus, Search, SquarePlus, X } from 'lucide-react'
import { CreateSpaceDialog } from '@/features/admin/components/CreateSpaceDialog'
import { useCurrentUser } from '@/features/auth/queries'
import { isSystemAdmin } from '@/shared/lib/roles'
import { usePersistentState } from '@/shared/lib/usePersistentState'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { useNavigation } from '../queries'
import { filterTree, pathTo } from '../tree'
import { CreateBoardDialog } from '@/features/boards/components/CreateBoardDialog'
import { useStructureActions } from '../useStructureActions'
import { NavTree } from './NavTree'
import { TreeNodeActions } from './TreeNodeActions'

/** Где мы сейчас: пространство, доска или карточка (ключ карточки начинается с ключа пространства). */
function currentTarget(pathname: string) {
  const space = matchPath('/spaces/:spaceKey', pathname)
  if (space) return { spaceKey: space.params.spaceKey }
  const board = matchPath('/boards/:boardId', pathname)
  if (board) return { boardId: board.params.boardId }
  const card = matchPath('/cards/:cardKey', pathname)
  if (card) return { spaceKey: card.params.cardKey?.split('-')[0] }
  return null
}

/**
 * Панель «Дерево» (docs/ui-reference/kaiten/README.md, «01 — Дерево»): заголовок и кнопка сворачивания,
 * поиск по дереву, «+» для системного администратора (папка или пространство), дерево папок,
 * пространств и досок. Раскрытые узлы запоминаются в браузере для каждого пользователя.
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
  const isAdmin = isSystemAdmin(user)
  const treeQuery = useNavigation()
  const { pathname } = useLocation()
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = usePersistentState<string[]>(
    `selen.nav.expanded.${user?.id ?? 'guest'}`,
    [],
  )
  // Создание из «+»: пространство — в корне (null) или в папке; доска — в пространстве (ключ)
  const [creatingSpace, setCreatingSpace] = useState<{ in: { id: string; name: string } | null }>()
  const [creatingBoard, setCreatingBoard] = useState<string | null>(null)
  const structure = useStructureActions(isAdmin)

  const nodes = useMemo(() => treeQuery.data ?? [], [treeQuery.data])
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])
  const filtered = useMemo(() => filterTree(nodes, query), [nodes, query])
  const searching = query.trim() !== ''

  // Переход по ссылке на пространство или доску раскрывает путь к ней — один раз на адрес,
  // чтобы пользователь мог потом свернуть папку, не теряя места
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    const target = currentTarget(pathname)
    if (!treeQuery.isSuccess || !target || revealed.current === pathname) return
    const path = pathTo(nodes, target)
    if (path.length === 0) return
    revealed.current = pathname
    setExpandedIds((previous) =>
      path.every((id) => previous.includes(id)) ? previous : [...new Set([...previous, ...path])],
    )
  }, [pathname, nodes, treeQuery.isSuccess, setExpandedIds])

  const toggle = (id: string) =>
    setExpandedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  const isExpanded = (id: string) => expanded.has(id) || (searching && filtered.expanded.has(id))

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
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('tree.add')}
                title={t('tree.add')}
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => structure.edit({ mode: 'create', parent: null })}>
                <FolderPlus />
                {t('tree.addFolder')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreatingSpace({ in: null })}>
                <SquarePlus />
                {t('tree.addSpace')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav aria-label={t('tree.title')} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {treeQuery.isError && (
          <p className="text-destructive px-2 text-xs">{tc('errors.loadFailed')}</p>
        )}
        {treeQuery.isSuccess && nodes.length === 0 && (
          <p className="text-muted-foreground px-2 text-xs">{t('tree.empty')}</p>
        )}
        {searching && filtered.nodes.length === 0 && nodes.length > 0 && (
          <p className="text-muted-foreground px-2 text-xs">{t('tree.nothingFound')}</p>
        )}
        <NavTree
          nodes={filtered.nodes}
          isExpanded={isExpanded}
          onToggle={toggle}
          onNavigate={onNavigate}
          actions={(node, depth) => (
            <TreeNodeActions
              node={node}
              depth={depth}
              isSystemAdmin={isAdmin}
              structure={structure}
              onAddSpace={(folder) => setCreatingSpace({ in: folder })}
              onAddBoard={setCreatingBoard}
            />
          )}
        />
      </nav>

      {isAdmin && (
        <>
          {structure.dialogs}
          <CreateSpaceDialog
            open={creatingSpace !== undefined}
            onOpenChange={(open) => !open && setCreatingSpace(undefined)}
            parent={creatingSpace?.in ?? null}
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
    </div>
  )
}
