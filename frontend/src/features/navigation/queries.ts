import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminCompanyId } from '@/features/admin/company'
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
 * (и инвалидирует ['spaces']), обновляет и дерево. Полное дерево компании — под ['admin', компания, ...].
 */
export const navigationKeys = {
  tree: () => ['spaces', 'navigation'] as const,
  admin: (company: string) => ['admin', company, 'navigation'] as const,
}

/** Дерево пользователя по компаниям (у кого компания одна — одно дерево без названия). */
export function useNavigation() {
  return useQuery({ queryKey: navigationKeys.tree(), queryFn: fetchNavigation })
}

/** Полное дерево «Структуры» компании; в дереве сайдбара — только её администратору (enabled). */
export function useAdminNavigation(enabled = true) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: navigationKeys.admin(company),
    queryFn: () => fetchAdminNavigation(company),
    enabled,
  })
}

/**
 * Ответ изменения — уже обновлённое полное дерево; дерево в сайдбаре и списки пространств перечитываем
 * (восстановление папки может вернуть и пространства).
 */
function useStructureMutation<TVariables>(
  mutationFn: (company: string, variables: TVariables) => Promise<AdminNavigation>,
) {
  const queryClient = useQueryClient()
  // Дерево компании админки или раздела дерева сайдбара (ADR-0024)
  const company = useAdminCompanyId()
  return useMutation({
    mutationFn: (variables: TVariables) => mutationFn(company, variables),
    onSuccess: (tree) => {
      queryClient.setQueryData(navigationKeys.admin(company), tree)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spaces'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', company, 'spaces'] }),
      ])
    },
  })
}

export function useCreateFolder() {
  return useStructureMutation(createFolder)
}

export function useUpdateNavNode() {
  return useStructureMutation(
    (company, { id, ...payload }: { id: string; name?: string; icon?: string | null }) =>
      updateNavNode(company, id, payload),
  )
}

export function useMoveNavNode() {
  return useStructureMutation(
    (
      company,
      {
        id,
        ...payload
      }: {
        id: string
        parent_id: string | null
        after_id?: string | null
        before_id?: string | null
      },
    ) => moveNavNode(company, id, payload),
  )
}

export function useDeleteFolder() {
  return useStructureMutation((company, id: string) => deleteFolder(company, id))
}

export function useSetFolderArchived() {
  return useStructureMutation(
    (
      company,
      { id, archived, restoreSpaces }: { id: string; archived: boolean; restoreSpaces?: boolean },
    ) => setFolderArchived(company, id, archived, restoreSpaces),
  )
}
