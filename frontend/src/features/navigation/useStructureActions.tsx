import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { hasCompanyPermission, useAdminCompany } from '@/features/admin/company'
import { useArchiveSpace, useDeleteSpace } from '@/features/admin/queries'
import type { AdminNavNode } from '@/shared/types/api'
import { FolderDialog, type FolderDialogTarget } from './components/FolderDialog'
import { MoveNodeDialog } from './components/MoveNodeDialog'
import { NodeAccessDialog, type NodeAccessTarget } from './components/NodeAccessDialog'
import {
  useAdminNavigation,
  useDeleteFolder,
  useMoveNavNode,
  useSetFolderArchived,
} from './queries'
import { activeStructure } from './tree'

/**
 * Действия «Структуры» над узлами дерева — одни для админки «Структура» и для меню «⋯»/«+» в дереве
 * сайдбара: те же запросы, проверки и сообщения (ADR-0013). Диалоги (папка, иконка, «Переместить в…», «Доступ…»,
 * подтверждение архива и удаления навсегда — папки и пространства, LATER-43) отрисовывает вызывающий
 * компонент — `dialogs`. Что пустое, а что нет, решает сервер: непустое — ошибка с объяснением.
 */
export function useStructureActions(enabled = true) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const query = useAdminNavigation(enabled)
  const moveNode = useMoveNavNode()
  const setArchived = useSetFolderArchived()
  const archiveSpace = useArchiveSpace()
  const deleteFolder = useDeleteFolder()
  const deleteSpace = useDeleteSpace()
  const [editing, setEditing] = useState<FolderDialogTarget | null>(null)
  const [moving, setMoving] = useState<AdminNavNode | null>(null)
  const [archiving, setArchiving] = useState<AdminNavNode | null>(null)
  const [deleting, setDeleting] = useState<AdminNavNode | null>(null)
  const [accessOf, setAccessOf] = useState<NodeAccessTarget | null>(null)
  // «Доступ…» — право компании «управлять доступом» (П2d-1); структуру ведёт право «управлять структурой»
  const canManageAccess = hasCompanyPermission(useAdminCompany(), 'company.manage_access')

  const all = useMemo(() => query.data?.data ?? [], [query.data])
  const maxDepth = query.data?.meta.max_depth ?? 4
  // Перестановки и выбор папки — только среди активных узлов (архивные не перемещаются)
  const active = useMemo(() => activeStructure(all), [all])

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const siblingsOf = (node: AdminNavNode) =>
    active.filter((item) => item.parent_id === node.parent_id)

  /** Первый или последний среди соседей — «Выше»/«Ниже» недоступны. */
  const position = (node: AdminNavNode) => {
    const siblings = siblingsOf(node)
    const index = siblings.findIndex((item) => item.id === node.id)
    return { first: index === 0, last: index === siblings.length - 1 }
  }

  /** Выше/ниже — перестановка среди соседей той же папки. */
  const shift = (node: AdminNavNode, direction: -1 | 1) => {
    const siblings = siblingsOf(node)
    const neighbour = siblings[siblings.findIndex((item) => item.id === node.id) + direction]
    if (!neighbour) return
    void run(
      () =>
        moveNode.mutateAsync({
          id: node.id,
          parent_id: node.parent_id,
          ...(direction < 0 ? { before_id: neighbour.id } : { after_id: neighbour.id }),
        }),
      t('structure.toasts.moved'),
    )
  }

  const nameOf = (node: AdminNavNode | null) => node?.name ?? node?.space?.name ?? ''
  const archivingSpace = archiving?.type === 'space'
  const deletingSpace = deleting?.type === 'space'

  const dialogs = (
    <>
      <FolderDialog target={editing} onClose={() => setEditing(null)} />
      <NodeAccessDialog node={accessOf} onClose={() => setAccessOf(null)} />
      <MoveNodeDialog
        node={moving}
        nodes={active}
        maxDepth={maxDepth}
        onClose={() => setMoving(null)}
      />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        pending={setArchived.isPending || archiveSpace.isPending}
        title={t(archivingSpace ? 'spaces.confirmArchiveTitle' : 'structure.confirmArchiveTitle')}
        description={t(
          archivingSpace ? 'spaces.confirmArchiveText' : 'structure.confirmArchiveText',
          { name: nameOf(archiving) },
        )}
        confirmLabel={t('structure.actions.archive')}
        onConfirm={async () => {
          const node = archiving
          if (node?.space)
            await run(() => archiveSpace.mutateAsync(node.space!.id), t('spaces.toasts.archived'))
          else if (node)
            await run(
              () => setArchived.mutateAsync({ id: node.id, archived: true }),
              t('structure.toasts.archived'),
            )
          setArchiving(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        pending={deleteFolder.isPending || deleteSpace.isPending}
        title={t(
          deletingSpace
            ? 'structure.confirmDeleteSpaceTitle'
            : 'structure.confirmDeleteFolderTitle',
        )}
        description={t(
          deletingSpace ? 'structure.confirmDeleteSpaceText' : 'structure.confirmDeleteFolderText',
          { name: nameOf(deleting) },
        )}
        confirmLabel={t('structure.confirmDelete')}
        onConfirm={async () => {
          const node = deleting
          if (node?.space)
            await run(
              () => deleteSpace.mutateAsync(node.space!.id),
              t('structure.toasts.deletedSpace'),
            )
          else if (node)
            await run(() => deleteFolder.mutateAsync(node.id), t('structure.toasts.deletedFolder'))
          setDeleting(null)
        }}
      />
    </>
  )

  return {
    query,
    all,
    active,
    maxDepth,
    setArchived,
    run,
    position,
    shift,
    /**
     * Есть ли у папки содержимое — в полном дереве, включая архивное и недоступное. Непустую папку удалить нельзя;
     * в дереве сайдбара видны только папки с доступными пространствами, так что там они всегда непустые.
     */
    hasChildren: (node: AdminNavNode) => all.some((item) => item.parent_id === node.id),
    /** Узел полного дерева по id (у узлов дерева сайдбара те же id). */
    nodeById: (id: string) => all.find((node) => node.id === id),
    edit: setEditing,
    move: setMoving,
    /** «Доступ…» папки или пространства — есть ли право и открыть окно. */
    canManageAccess,
    access: (node: AdminNavNode) =>
      setAccessOf({
        id: node.id,
        type: node.type,
        name: node.name ?? node.space?.name ?? '',
      }),
    archive: setArchiving,
    /** Удалить навсегда (только пустое — проверяет сервер). */
    remove: setDeleting,
    dialogs,
  }
}

export type StructureActions = ReturnType<typeof useStructureActions>
