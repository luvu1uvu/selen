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
  fetchCompanies,
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
  saveCompany,
  saveGroup,
  setCardTypeArchived,
  setGroupArchived,
  type EventFilters,
  type UserFilters,
} from './api'
import { useAdminCompanyId } from './company'

/**
 * Ключи админки — с компанией (ADR-0024): после смены компании не видны данные прошлой. Всё под ['admin', …] —
 * изменения перечитывают админку целиком (useInvalidateAdmin); список компаний Владельца — ['admin', 'companies'].
 */
export const adminKeys = {
  companies: () => ['admin', 'companies'] as const,
  users: (company: string, filters: UserFilters) => ['admin', company, 'users', filters] as const,
  invitations: (company: string, page: number) => ['admin', company, 'invitations', page] as const,
  events: (company: string, filters: EventFilters) =>
    ['admin', company, 'events', filters] as const,
  spaces: (company: string) => ['admin', company, 'spaces'] as const,
  cardTypes: (company: string) => ['admin', company, 'card-types'] as const,
  groups: (company: string) => ['admin', company, 'groups'] as const,
  group: (company: string, id: string) => ['admin', company, 'groups', id] as const,
  userAccess: (company: string, userId: string) =>
    ['admin', company, 'user-access', userId] as const,
  deactivationImpact: (company: string, userId: string) =>
    ['admin', company, 'deactivation-impact', userId] as const,
  trash: (company: string, page: number) => ['admin', company, 'trash', page] as const,
}

/** Компании — экран Владельца. */
export function useCompanies(enabled = true) {
  return useQuery({ queryKey: adminKeys.companies(), queryFn: fetchCompanies, enabled })
}

/**
 * Создать или переименовать компанию. Компании Владельца в `/auth/me` (выбор компании, названия) — перечитываем, как
 * и дерево (названия компаний в заголовках).
 */
export function useSaveCompany() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) => saveCompany({ name }, id),
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: currentUserKey })]),
  })
}

/** Назначить или снять администратора компании (Владелец, экран «Компании»): компания — из аргумента, не из адреса. */
export function useSetCompanyAdmin() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ company, userId, admin }: { company: string; userId: string; admin: boolean }) =>
      changeUserRole(company, userId, admin ? 'admin' : 'member'),
    onSuccess: invalidate,
  })
}

export function useUsers(filters: UserFilters) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.users(company, filters),
    queryFn: () => fetchUsers(company, filters),
    placeholderData: keepPreviousData,
  })
}

export function useInvitations(page: number) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.invitations(company, page),
    queryFn: () => fetchInvitations(company, page),
    placeholderData: keepPreviousData,
  })
}

export function useEvents(filters: EventFilters) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.events(company, filters),
    queryFn: () => fetchEvents(company, filters),
    placeholderData: keepPreviousData,
  })
}

export function useTrash(page: number) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.trash(company, page),
    queryFn: () => fetchTrash(company, page),
    placeholderData: keepPreviousData,
  })
}

/** Восстановленная карточка снова на доске и в поиске — перечитываем и их. */
export function useRestoreFromTrash() {
  const company = useAdminCompanyId()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof restoreFromTrash>[1]) => restoreFromTrash(company, arg),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['boards'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
      ]),
  })
}

export function useAdminSpaces() {
  const company = useAdminCompanyId()
  return useQuery({ queryKey: adminKeys.spaces(company), queryFn: () => fetchAdminSpaces(company) })
}

export function useAdminCardTypes() {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.cardTypes(company),
    queryFn: () => fetchAdminCardTypes(company),
  })
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
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) =>
      changeUserRole(company, userId, role),
    onSuccess: invalidate,
  })
}

/** Передача владения: роль текущего пользователя меняется — перечитываем и его (`/auth/me`). */
export function useTransferOwnership() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      transferOwnership(company, userId, password),
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: currentUserKey })]),
  })
}

export function useDeactivateUser() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof deactivateUser>[1]) => deactivateUser(company, arg),
    onSuccess: invalidate,
  })
}

export function useReactivateUser() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof reactivateUser>[1]) => reactivateUser(company, arg),
    onSuccess: invalidate,
  })
}

export function useInviteUser() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof inviteUser>[1]) => inviteUser(company, arg),
    onSuccess: invalidate,
  })
}

export function useResendInvitation() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof resendInvitation>[1]) => resendInvitation(company, arg),
    onSuccess: invalidate,
  })
}

export function useRevokeInvitation() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof revokeInvitation>[1]) => revokeInvitation(company, arg),
    onSuccess: invalidate,
  })
}

export function useCreateSpace() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof createSpace>[1]) => createSpace(company, arg),
    onSuccess: invalidate,
  })
}

export function useArchiveSpace() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof archiveSpace>[1]) => archiveSpace(company, arg),
    onSuccess: invalidate,
  })
}

/** Открытые доска и карточки удалённого пространства перечитываются и показывают «не найдено». */
export function useDeleteSpace() {
  const company = useAdminCompanyId()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof deleteSpace>[1]) => deleteSpace(company, arg),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['boards'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
      ]),
  })
}

export function useRestoreSpace() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (arg: Parameters<typeof restoreSpace>[1]) => restoreSpace(company, arg),
    onSuccess: invalidate,
  })
}

export function useAssignSpaceRole() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ spaceId, userId, role }: { spaceId: string; userId: string; role: SpaceRole }) =>
      assignSpaceRole(company, spaceId, userId, role),
    onSuccess: invalidate,
  })
}

export function useSaveCardType() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id?: string; name: string; color: string }) =>
      saveCardType(company, payload, id),
    onSuccess: invalidate,
  })
}

export function useSetCardTypeArchived() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setCardTypeArchived(company, id, archived),
    onSuccess: invalidate,
  })
}

export function useUserAccess(userId: string) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.userAccess(company, userId),
    queryFn: () => fetchUserAccess(company, userId),
  })
}

/** Запрашивается при открытии диалога деактивации — данные всегда свежие. */
export function useDeactivationImpact(userId: string | null) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.deactivationImpact(company, userId ?? ''),
    queryFn: () => fetchDeactivationImpact(company, userId ?? ''),
    enabled: userId !== null,
    staleTime: 0,
  })
}

export function useGroups() {
  const company = useAdminCompanyId()
  return useQuery({ queryKey: adminKeys.groups(company), queryFn: () => fetchGroups(company) })
}

export function useGroup(id: string) {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: adminKeys.group(company, id),
    queryFn: () => fetchGroup(company, id),
  })
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
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id?: string; name: string; description: string | null }) =>
      saveGroup(company, payload, id),
    onSuccess: invalidate,
  })
}

export function useSetGroupArchived() {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setGroupArchived(company, id, archived),
    onSuccess: invalidate,
  })
}

export function useAddGroupMember(groupId: string) {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (userId: string) => addGroupMember(company, groupId, userId),
    onSuccess: invalidate,
  })
}

export function useRemoveGroupMember(groupId: string) {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (userId: string) => removeGroupMember(company, groupId, userId),
    onSuccess: invalidate,
  })
}

export function useAssignGroupSpace(groupId: string) {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({
      spaceId,
      ...payload
    }: {
      spaceId: string
      role: SpaceRole
      own_cards_only: boolean
    }) => assignGroupSpace(company, groupId, spaceId, payload),
    onSuccess: invalidate,
  })
}

export function useRevokeGroupSpace(groupId: string) {
  const company = useAdminCompanyId()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: (spaceId: string) => revokeGroupSpace(company, groupId, spaceId),
    onSuccess: invalidate,
  })
}
