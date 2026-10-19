import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminNavigation } from '@/shared/types/api'
import {
  createFolder,
  deleteFolder,
  fetchAdminNavigation,
  fetchNavigation,
  moveNavNode,
  setFolderArchived,
  updateNavNode,
} from './api'

/**
 * Дерево пользователя лежит под ключом ['spaces', ...]: всё, что меняет пространства, доски и права
 * (и инвалидирует ['spaces']), обновляет и дерево. Полное дерево — под ['admin', ...].
 */
export const navigationKeys = {
  tree: () => ['spaces', 'navigation'] as const,
  admin: () => ['admin', 'navigation'] as const,
}

export function useNavigation() {
  return useQuery({ queryKey: navigationKeys.tree(), queryFn: fetchNavigation })
}

/** Полное дерево «Структуры»; в дереве сайдбара — только для системного администратора (enabled). */
export function useAdminNavigation(enabled = true) {
  return useQuery({ queryKey: navigationKeys.admin(), queryFn: fetchAdminNavigation, enabled })
}

/**
 * Ответ изменения — уже обновлённое полное дерево; дерево в сайдбаре и списки пространств перечитываем
 * (восстановление папки может вернуть и пространства).
 */
function useStructureMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<AdminNavigation>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (tree) => {
      queryClient.setQueryData(navigationKeys.admin(), tree)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spaces'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] }),
      ])
    },
  })
}

export function useCreateFolder() {
  return useStructureMutation(createFolder)
}

export function useUpdateNavNode() {
  return useStructureMutation(
    ({ id, ...payload }: { id: string; name?: string; icon?: string | null }) =>
      updateNavNode(id, payload),
  )
}

export function useMoveNavNode() {
  return useStructureMutation(
    ({
      id,
      ...payload
    }: {
      id: string
      parent_id: string | null
      after_id?: string | null
      before_id?: string | null
    }) => moveNavNode(id, payload),
  )
}

export function useDeleteFolder() {
  return useStructureMutation((id: string) => deleteFolder(id))
}

export function useSetFolderArchived() {
  return useStructureMutation(
    ({ id, archived, restoreSpaces }: { id: string; archived: boolean; restoreSpaces?: boolean }) =>
      setFolderArchived(id, archived, restoreSpaces),
  )
}
