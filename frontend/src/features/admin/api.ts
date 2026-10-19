import { api } from '@/shared/api/client'
import type {
  AdminSpace,
  AdminUser,
  AssignableRole,
  CardType,
  Collection,
  DeactivationImpact,
  EventLogEntry,
  Group,
  Invitation,
  Paginated,
  Resource,
  SpaceRole,
  TrashedCard,
  UserAccess,
  UserStatus,
} from '@/shared/types/api'

export interface UserFilters {
  status?: UserStatus
  search?: string
  page?: number
}

export interface EventFilters {
  event_type?: string
  page?: number
}

export async function fetchUsers(filters: UserFilters): Promise<Paginated<AdminUser>> {
  const { data } = await api.get<Paginated<AdminUser>>('/admin/users', { params: filters })
  return data
}

export async function changeUserRole(userId: string, role: AssignableRole): Promise<AdminUser> {
  const { data } = await api.patch<Resource<AdminUser>>(`/admin/users/${userId}/role`, { role })
  return data.data
}

export async function deactivateUser(userId: string): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(`/admin/users/${userId}/deactivate`)
  return data.data
}

export async function reactivateUser(userId: string): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(`/admin/users/${userId}/reactivate`)
  return data.data
}

/** Передача владения (только Владелец, с паролем). Ответ — новый Владелец. */
export async function transferOwnership(userId: string, password: string): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/users/${userId}/transfer-ownership`,
    { password },
  )
  return data.data
}

export async function fetchInvitations(page: number): Promise<Paginated<Invitation>> {
  const { data } = await api.get<Paginated<Invitation>>('/admin/invitations', { params: { page } })
  return data
}

export async function inviteUser(payload: {
  name: string
  email: string
  role: AssignableRole
}): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>('/admin/invitations', payload)
  return data.data
}

export async function resendInvitation(invitationId: string): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>(`/admin/invitations/${invitationId}/resend`)
  return data.data
}

export async function revokeInvitation(invitationId: string): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>(`/admin/invitations/${invitationId}/revoke`)
  return data.data
}

export async function fetchEvents(filters: EventFilters): Promise<Paginated<EventLogEntry>> {
  const { data } = await api.get<Paginated<EventLogEntry>>('/admin/events', { params: filters })
  return data
}

/** Корзина карточек (ADR-0015): новые удалённые сверху. */
export async function fetchTrash(page: number): Promise<Paginated<TrashedCard>> {
  const { data } = await api.get<Paginated<TrashedCard>>('/admin/trash/cards', { params: { page } })
  return data
}

/** Вернуть карточку из корзины туда, откуда её удалили. */
export async function restoreFromTrash(key: string): Promise<TrashedCard> {
  const { data } = await api.post<Resource<TrashedCard>>(`/admin/trash/cards/${key}/restore`)
  return data.data
}

export async function fetchAdminSpaces(): Promise<AdminSpace[]> {
  const { data } = await api.get<Collection<AdminSpace>>('/admin/spaces')
  return data.data
}

export async function createSpace(payload: {
  name: string
  key: string
  description: string | null
  icon: string | null
  /** Не передан — администратором станет сам системный администратор. */
  admin_ids?: string[]
  /** Папка в дереве навигации (null или нет — корень). */
  parent_id?: string | null
}): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>('/admin/spaces', payload)
  return data.data
}

export async function archiveSpace(spaceId: string): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>(`/admin/spaces/${spaceId}/archive`)
  return data.data
}

/** Удалить пространство навсегда (LATER-43): только если в нём никогда не было карточек — ни архивных, ни в корзине. */
export async function deleteSpace(spaceId: string): Promise<void> {
  await api.delete(`/admin/spaces/${spaceId}`)
}

export async function restoreSpace(spaceId: string): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>(`/admin/spaces/${spaceId}/restore`)
  return data.data
}

export async function assignSpaceRole(
  spaceId: string,
  userId: string,
  role: SpaceRole,
): Promise<AdminSpace> {
  const { data } = await api.put<Resource<AdminSpace>>(
    `/admin/spaces/${spaceId}/members/${userId}`,
    { role },
  )
  return data.data
}

export async function fetchAdminCardTypes(): Promise<CardType[]> {
  const { data } = await api.get<Collection<CardType>>('/admin/card-types')
  return data.data
}

export async function saveCardType(
  payload: { name: string; color: string },
  id?: string,
): Promise<CardType> {
  const { data } = id
    ? await api.patch<Resource<CardType>>(`/admin/card-types/${id}`, payload)
    : await api.post<Resource<CardType>>('/admin/card-types', payload)
  return data.data
}

export async function setCardTypeArchived(id: string, archived: boolean): Promise<CardType> {
  const action = archived ? 'archive' : 'restore'
  const { data } = await api.post<Resource<CardType>>(`/admin/card-types/${id}/${action}`)
  return data.data
}

/** К каким пространствам у пользователя доступ и почему (по источникам). */
export async function fetchUserAccess(userId: string): Promise<UserAccess> {
  const { data } = await api.get<Resource<UserAccess>>(`/admin/users/${userId}/access`)
  return data.data
}

/** Пространства, которые после деактивации останутся без личного администратора. */
export async function fetchDeactivationImpact(userId: string): Promise<DeactivationImpact> {
  const { data } = await api.get<Resource<DeactivationImpact>>(
    `/admin/users/${userId}/deactivation-impact`,
  )
  return data.data
}

export async function fetchGroups(): Promise<Group[]> {
  const { data } = await api.get<Collection<Group>>('/admin/groups')
  return data.data
}

export async function fetchGroup(id: string): Promise<Group> {
  const { data } = await api.get<Resource<Group>>(`/admin/groups/${id}`)
  return data.data
}

export async function saveGroup(
  payload: { name: string; description: string | null },
  id?: string,
): Promise<Group> {
  const { data } = id
    ? await api.patch<Resource<Group>>(`/admin/groups/${id}`, payload)
    : await api.post<Resource<Group>>('/admin/groups', payload)
  return data.data
}

export async function setGroupArchived(id: string, archived: boolean): Promise<Group> {
  const action = archived ? 'archive' : 'restore'
  const { data } = await api.post<Resource<Group>>(`/admin/groups/${id}/${action}`)
  return data.data
}

export async function addGroupMember(groupId: string, userId: string): Promise<Group> {
  const { data } = await api.post<Resource<Group>>(`/admin/groups/${groupId}/members`, {
    user_id: userId,
  })
  return data.data
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await api.delete(`/admin/groups/${groupId}/members/${userId}`)
}

/** Выдать или изменить доступ группы к пространству. */
export async function assignGroupSpace(
  groupId: string,
  spaceId: string,
  payload: { role: SpaceRole; own_cards_only: boolean },
): Promise<Group> {
  const { data } = await api.put<Resource<Group>>(
    `/admin/groups/${groupId}/spaces/${spaceId}`,
    payload,
  )
  return data.data
}

export async function revokeGroupSpace(groupId: string, spaceId: string): Promise<void> {
  await api.delete(`/admin/groups/${groupId}/spaces/${spaceId}`)
}
