import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { currentUserKey } from '@/features/auth/queries'
import type { AssignableRole, SpaceRole } from '@/shared/types/api'
import {
  addGroupMember,
  archiveSpace,
  deleteSpace,
  assignGroupSpace,
  assignSpaceRole,
  changeUserRole,
  transferOwnership,
  createSpace,
  deactivateUser,
  fetchAdminCardTypes,
  fetchAdminSpaces,
  fetchDeactivationImpact,
  fetchEvents,
  fetchGroup,
  fetchGroups,
  fetchInvitations,
  fetchTrash,
  fetchUserAccess,
  fetchUsers,
  inviteUser,
  reactivateUser,
  removeGroupMember,
  resendInvitation,
  restoreFromTrash,
  restoreSpace,
  revokeGroupSpace,
  revokeInvitation,
  saveCardType,
  saveGroup,
  setCardTypeArchived,
  setGroupArchived,
  type EventFilters,
  type UserFilters,
} from './api'

export const adminKeys = {
  users: (filters: UserFilters) => ['admin', 'users', filters] as const,
  invitations: (page: number) => ['admin', 'invitations', page] as const,
  events: (filters: EventFilters) => ['admin', 'events', filters] as const,
  spaces: () => ['admin', 'spaces'] as const,
  cardTypes: () => ['admin', 'card-types'] as const,
  groups: () => ['admin', 'groups'] as const,
  group: (id: string) => ['admin', 'groups', id] as const,
  userAccess: (userId: string) => ['admin', 'user-access', userId] as const,
  deactivationImpact: (userId: string) => ['admin', 'deactivation-impact', userId] as const,
  trash: (page: number) => ['admin', 'trash', page] as const,
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: adminKeys.users(filters),
    queryFn: () => fetchUsers(filters),
    placeholderData: keepPreviousData,
  })
}

export function useInvitations(page: number) {
  return useQuery({
    queryKey: adminKeys.invitations(page),
    queryFn: () => fetchInvitations(page),
    placeholderData: keepPreviousData,
  })
}

export function useEvents(filters: EventFilters) {
  return useQuery({
    queryKey: adminKeys.events(filters),
    queryFn: () => fetchEvents(filters),
    placeholderData: keepPreviousData,
  })
}

export function useTrash(page: number) {
  return useQuery({
    queryKey: adminKeys.trash(page),
    queryFn: () => fetchTrash(page),
    placeholderData: keepPreviousData,
  })
}

/** Восстановленная карточка снова на доске и в поиске — перечитываем и их. */
export function useRestoreFromTrash() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: restoreFromTrash,
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['boards'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
      ]),
  })
}

export function useAdminSpaces() {
  return useQuery({ queryKey: adminKeys.spaces(), queryFn: fetchAdminSpaces })
}

export function useAdminCardTypes() {
  return useQuery({ queryKey: adminKeys.cardTypes(), queryFn: fetchAdminCardTypes })
}

/**
 * После любого изменения обновляем админские списки и журнал. Пространства и типы карточек
 * видны и вне админки (сайдбар, выбор типа) — их тоже перечитываем.
 */
function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      queryClient.invalidateQueries({ queryKey: ['card-types'] }),
    ])
}

export function useChangeRole() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) =>
      changeUserRole(userId, role),
    onSuccess: invalidate,
  })
}

/** Передача владения: роль текущего пользователя меняется — перечитываем и его (`/auth/me`). */
export function useTransferOwnership() {
  const invalidate = useInvalidateAdmin()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      transferOwnership(userId, password),
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: currentUserKey })]),
  })
}

export function useDeactivateUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: deactivateUser, onSuccess: invalidate })
}

export function useReactivateUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: reactivateUser, onSuccess: invalidate })
}

export function useInviteUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: inviteUser, onSuccess: invalidate })
}

export function useResendInvitation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: resendInvitation, onSuccess: invalidate })
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: revokeInvitation, onSuccess: invalidate })
}

export function useCreateSpace() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: createSpace, onSuccess: invalidate })
}

export function useArchiveSpace() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: archiveSpace, onSuccess: invalidate })
}

/** Открытые доска и карточки удалённого пространства перечитываются и показывают «не найдено». */
export function useDeleteSpace() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: deleteSpace,
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['boards'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
      ]),
  })
}

export function useRestoreSpace() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: restoreSpace, onSuccess: invalidate })
}

export function useAssignSpaceRole() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ spaceId, userId, role }: { spaceId: string; userId: string; role: SpaceRole }) =>
      assignSpaceRole(spaceId, userId, role),
    onSuccess: invalidate,
  })
}

export function useSaveCardType() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id?: string; name: string; color: string }) =>
      saveCardType(payload, id),
    onSuccess: invalidate,
  })
}

export function useSetCardTypeArchived() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setCardTypeArchived(id, archived),
    onSuccess: invalidate,
  })
}

export function useUserAccess(userId: string) {
  return useQuery({
    queryKey: adminKeys.userAccess(userId),
    queryFn: () => fetchUserAccess(userId),
  })
}

/** Запрашивается при открытии диалога деактивации — данные всегда свежие. */
export function useDeactivationImpact(userId: string | null) {
  return useQuery({
    queryKey: adminKeys.deactivationImpact(userId ?? ''),
    queryFn: () => fetchDeactivationImpact(userId ?? ''),
    enabled: userId !== null,
    staleTime: 0,
  })
}

export function useGroups() {
  return useQuery({ queryKey: adminKeys.groups(), queryFn: fetchGroups })
}

export function useGroup(id: string) {
  return useQuery({ queryKey: adminKeys.group(id), queryFn: () => fetchGroup(id) })
}

/**
 * Состав и доступы групп меняют права в пространствах — кроме админки обновляем пространства
 * и справочник групп.
 */
function useInvalidateGroups() {
  const queryClient = useQueryClient()
  const invalidateAdmin = useInvalidateAdmin()
  return () =>
    Promise.all([invalidateAdmin(), queryClient.invalidateQueries({ queryKey: ['groups'] })])
}

export function useSaveGroup() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id?: string; name: string; description: string | null }) =>
      saveGroup(payload, id),
    onSuccess: invalidate,
  })
}

export function useSetGroupArchived() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setGroupArchived(id, archived),
    onSuccess: invalidate,
  })
}

export function useAddGroupMember(groupId: string) {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (userId: string) => addGroupMember(groupId, userId),
    onSuccess: invalidate,
  })
}

export function useRemoveGroupMember(groupId: string) {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (userId: string) => removeGroupMember(groupId, userId),
    onSuccess: invalidate,
  })
}

export function useAssignGroupSpace(groupId: string) {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({
      spaceId,
      ...payload
    }: {
      spaceId: string
      role: SpaceRole
      own_cards_only: boolean
    }) => assignGroupSpace(groupId, spaceId, payload),
    onSuccess: invalidate,
  })
}

export function useRevokeGroupSpace(groupId: string) {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (spaceId: string) => revokeGroupSpace(groupId, spaceId),
    onSuccess: invalidate,
  })
}
