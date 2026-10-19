import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { AdminNavNode } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { EveryoneMark, HiddenFromTreeMark, NodeIcon } from './components/NodeIcon'
import { RestoreFolderDialog } from './components/RestoreFolderDialog'
import { useNavigation } from './queries'
import { archivedSpacesIn, structureRows, treeNodeIds } from './tree'
import { useStructureActions } from './useStructureActions'

function nodeName(node: AdminNavNode) {
  return node.name ?? node.space?.name ?? ''
}

/**
 * Админка «Структура» (ADR-0013): дерево папок и пространств, меню узла — изменить, переместить в…,
 * выше/ниже, вложенная папка, архив. Архивные пространства видны на своих местах (приглушённо), архивные
 * папки — отдельным блоком с их содержимым и восстановлением. Меню вместо перетаскивания: надёжно и доступно с клавиатуры
 * (как колонки, ADR-0007); перетаскивание — в backlog.
 */
export function StructurePage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const structure = useStructureActions()
  const { query: navigationQuery, all, maxDepth, setArchived, run, position } = structure
  const [restoring, setRestoring] = useState<AdminNavNode | null>(null)

  const rows = useMemo(() => structureRows(all), [all])
  // Узлы дерева текущего пользователя (тот же запрос, что у сайдбара, id узлов общие): остальные активные
  // узлы помечаются «Не видно в вашем дереве». Пока дерево не загружено — без пометок.
  const treeQuery = useNavigation()
  const inMyTree = useMemo(
    () => (treeQuery.data ? treeNodeIds(treeQuery.data) : null),
    [treeQuery.data],
  )
  const archivedFolders = all.filter((node) => node.type === 'folder' && node.archived_at)

  const restore = (folder: AdminNavNode, restoreSpaces: boolean) =>
    run(
      () => setArchived.mutateAsync({ id: folder.id, archived: false, restoreSpaces }),
      restoreSpaces ? t('structure.toasts.restoredWithSpaces') : t('structure.toasts.restored'),
    )

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('structure.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('structure.description')}</p>
        </div>
        <Button onClick={() => structure.edit({ mode: 'create', parent: null })}>
          <FolderPlus />
          {t('structure.createFolder')}
        </Button>
      </div>

      {navigationQuery.isError && (
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      )}
      {navigationQuery.isPending && (
        <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
      )}

      <section aria-label={t('structure.title')} className="max-w-3xl rounded-lg border">
        {navigationQuery.isSuccess && rows.length === 0 && (
          <p className="text-muted-foreground p-6 text-center text-sm">{t('structure.empty')}</p>
        )}
        <ul className="divide-y">
          {rows.map((node) => {
            const name = nodeName(node)
            if (node.space?.archived_at) {
              return (
                <li
                  key={node.id}
                  className="text-muted-foreground flex min-h-11 items-center gap-2 py-1 pr-2"
                  style={{ paddingLeft: `${12 + (node.depth - 1) * 24}px` }}
                  title={t('structure.archivedSpaceHint')}
                >
                  <NodeIcon kind="space" icon={node.icon} className="opacity-50" />
                  <span className="truncate">{name}</span>
                  <Badge variant="outline" className="font-mono">
                    {node.space.key}
                  </Badge>
                  <Badge variant="secondary">{t('structure.archivedSpace')}</Badge>
                </li>
              )
            }
            const { first, last } = position(node)
            return (
              <li
                key={node.id}
                className="flex min-h-11 items-center gap-2 py-1 pr-2"
                style={{ paddingLeft: `${12 + (node.depth - 1) * 24}px` }}
              >
                <NodeIcon kind={node.type} icon={node.icon} />
                {node.everyone && <EveryoneMark folder={node.type === 'folder'} />}
                {inMyTree && !inMyTree.has(node.id) && <HiddenFromTreeMark />}
                <span className={node.type === 'folder' ? 'truncate font-medium' : 'truncate'}>
                  {node.type === 'space' && node.space ? (
                    <Link to={`/spaces/${node.space.key}`} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </span>
                {node.space && (
                  <Badge
                    variant="secondary"
                    className="font-mono"
                    title={t('structure.spaceKey', { key: node.space.key })}
                  >
                    {node.space.key}
                  </Badge>
                )}
                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t('structure.actions.menu', { name })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          structure.edit(
                            node.type === 'folder'
                              ? { mode: 'folder', id: node.id, name, icon: node.icon }
                              : { mode: 'icon', id: node.id, name, icon: node.icon },
                          )
                        }
                      >
                        <Pencil />
                        {node.type === 'folder'
                          ? t('structure.actions.edit')
                          : t('structure.actions.icon')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => structure.move(node)}>
                        <FolderInput />
                        {t('structure.actions.move')}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={first} onSelect={() => structure.shift(node, -1)}>
                        <ArrowUp />
                        {t('structure.actions.up')}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={last} onSelect={() => structure.shift(node, 1)}>
                        <ArrowDown />
                        {t('structure.actions.down')}
                      </DropdownMenuItem>
                      {node.type === 'folder' && (
                        <>
                          <DropdownMenuItem
                            disabled={node.depth >= maxDepth}
                            onSelect={() =>
                              structure.edit({ mode: 'create', parent: { id: node.id, name } })
                            }
                          >
                            <FolderPlus />
                            {t('structure.actions.addSubfolder')}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => structure.archive(node)}>
                        <Archive />
                        {t('structure.actions.archive')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={node.type === 'folder' && structure.hasChildren(node)}
                        title={
                          node.type === 'folder' && structure.hasChildren(node)
                            ? t('structure.deleteNotEmpty')
                            : undefined
                        }
                        onSelect={() => structure.remove(node)}
                      >
                        <Trash2 />
                        {t('structure.actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="grid max-w-3xl gap-3" aria-labelledby="structure-archived-title">
        <div>
          <h2 id="structure-archived-title" className="text-lg font-semibold">
            {t('structure.archivedTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('structure.archivedHint')}</p>
        </div>
        {archivedFolders.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('structure.archivedEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {archivedFolders.map((node) => {
              const inside = archivedSpacesIn(all, node.id)
              return (
                <li key={node.id} className="flex min-h-11 items-center gap-2 px-3 py-1">
                  <NodeIcon kind="folder" icon={node.icon} />
                  <div className="grid min-w-0">
                    <span className="truncate">{node.name}</span>
                    {inside.length > 0 && (
                      <span className="text-muted-foreground truncate text-xs">
                        {t('structure.archivedInside', {
                          names: inside.map((item) => item.space?.name).join(', '),
                        })}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={setArchived.isPending}
                    onClick={() =>
                      inside.length > 0 ? setRestoring(node) : void restore(node, false)
                    }
                  >
                    <ArchiveRestore />
                    {t('structure.actions.restore')}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {structure.dialogs}
      <RestoreFolderDialog
        folder={restoring}
        spaces={restoring ? archivedSpacesIn(all, restoring.id) : []}
        pending={setArchived.isPending}
        onClose={() => setRestoring(null)}
        onConfirm={async (restoreSpaces) => {
          if (restoring) await restore(restoring, restoreSpaces)
          setRestoring(null)
        }}
      />
    </div>
  )
}
