import { api } from '@/shared/api/client'
import type {
  AdminSpace,
  AdminUser,
  AssignableRole,
  CardType,
  Collection,
  Company,
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

/** Компании — экран Владельца (ADR-0024). */
export async function fetchCompanies(): Promise<Company[]> {
  const { data } = await api.get<Collection<Company>>('/admin/companies')
  return data.data
}

/** Новая компания (справочники — из шаблона) или новое название. */
export async function saveCompany(payload: { name: string }, id?: string): Promise<Company> {
  const { data } = id
    ? await api.patch<Resource<Company>>(`/admin/companies/${id}`, payload)
    : await api.post<Resource<Company>>('/admin/companies', payload)
  return data.data
}

export async function fetchUsers(
  company: string,
  filters: UserFilters,
): Promise<Paginated<AdminUser>> {
  const { data } = await api.get<Paginated<AdminUser>>(`/admin/companies/${company}/users`, {
    params: filters,
  })
  return data
}

export async function changeUserRole(
  company: string,
  userId: string,
  role: AssignableRole,
): Promise<AdminUser> {
  const { data } = await api.patch<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/role`,
    { role },
  )
  return data.data
}

export async function deactivateUser(company: string, userId: string): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/deactivate`,
  )
  return data.data
}

export async function reactivateUser(company: string, userId: string): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/reactivate`,
  )
  return data.data
}

/** Передача владения (только Владелец, с паролем). Ответ — новый Владелец. */
export async function transferOwnership(
  company: string,
  userId: string,
  password: string,
): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/transfer-ownership`,
    { password },
  )
  return data.data
}

export async function fetchInvitations(
  company: string,
  page: number,
): Promise<Paginated<Invitation>> {
  const { data } = await api.get<Paginated<Invitation>>(`/admin/companies/${company}/invitations`, {
    params: { page },
  })
  return data
}

export async function inviteUser(
  company: string,
  payload: {
    name: string
    email: string
    role: AssignableRole
  },
): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>(
    `/admin/companies/${company}/invitations`,
    payload,
  )
  return data.data
}

export async function resendInvitation(company: string, invitationId: string): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>(
    `/admin/companies/${company}/invitations/${invitationId}/resend`,
  )
  return data.data
}

export async function revokeInvitation(company: string, invitationId: string): Promise<Invitation> {
  const { data } = await api.post<Resource<Invitation>>(
    `/admin/companies/${company}/invitations/${invitationId}/revoke`,
  )
  return data.data
}

export async function fetchEvents(
  company: string,
  filters: EventFilters,
): Promise<Paginated<EventLogEntry>> {
  const { data } = await api.get<Paginated<EventLogEntry>>(`/admin/companies/${company}/events`, {
    params: filters,
  })
  return data
}

/** Корзина карточек (ADR-0015): новые удалённые сверху. */
export async function fetchTrash(company: string, page: number): Promise<Paginated<TrashedCard>> {
  const { data } = await api.get<Paginated<TrashedCard>>(
    `/admin/companies/${company}/trash/cards`,
    { params: { page } },
  )
  return data
}

/** Вернуть карточку из корзины туда, откуда её удалили. */
export async function restoreFromTrash(company: string, key: string): Promise<TrashedCard> {
  const { data } = await api.post<Resource<TrashedCard>>(
    `/admin/companies/${company}/trash/cards/${key}/restore`,
  )
  return data.data
}

export async function fetchAdminSpaces(company: string): Promise<AdminSpace[]> {
  const { data } = await api.get<Collection<AdminSpace>>(`/admin/companies/${company}/spaces`)
  return data.data
}

export async function createSpace(
  company: string,
  payload: {
    name: string
    key: string
    description: string | null
    icon: string | null
    /** Не передан — администратором станет сам системный администратор. */
    admin_ids?: string[]
    /** Папка в дереве навигации (null или нет — корень). */
    parent_id?: string | null
  },
): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>(
    `/admin/companies/${company}/spaces`,
    payload,
  )
  return data.data
}

export async function archiveSpace(company: string, spaceId: string): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>(
    `/admin/companies/${company}/spaces/${spaceId}/archive`,
  )
  return data.data
}

/** Удалить пространство навсегда (LATER-43): только если в нём никогда не было карточек — ни архивных, ни в корзине. */
export async function deleteSpace(company: string, spaceId: string): Promise<void> {
  await api.delete(`/admin/companies/${company}/spaces/${spaceId}`)
}

export async function restoreSpace(company: string, spaceId: string): Promise<AdminSpace> {
  const { data } = await api.post<Resource<AdminSpace>>(
    `/admin/companies/${company}/spaces/${spaceId}/restore`,
  )
  return data.data
}

export async function assignSpaceRole(
  company: string,
  spaceId: string,
  userId: string,
  role: SpaceRole,
): Promise<AdminSpace> {
  const { data } = await api.put<Resource<AdminSpace>>(
    `/admin/companies/${company}/spaces/${spaceId}/members/${userId}`,
    { role },
  )
  return data.data
}

export async function fetchAdminCardTypes(company: string): Promise<CardType[]> {
  const { data } = await api.get<Collection<CardType>>(`/admin/companies/${company}/card-types`)
  return data.data
}

export async function saveCardType(
  company: string,
  payload: { name: string; color: string },
  id?: string,
): Promise<CardType> {
  const { data } = id
    ? await api.patch<Resource<CardType>>(`/admin/companies/${company}/card-types/${id}`, payload)
    : await api.post<Resource<CardType>>(`/admin/companies/${company}/card-types`, payload)
  return data.data
}

export async function setCardTypeArchived(
  company: string,
  id: string,
  archived: boolean,
): Promise<CardType> {
  const action = archived ? 'archive' : 'restore'
  const { data } = await api.post<Resource<CardType>>(
    `/admin/companies/${company}/card-types/${id}/${action}`,
  )
  return data.data
}

/** К каким пространствам у пользователя доступ и почему (по источникам). */
export async function fetchUserAccess(company: string, userId: string): Promise<UserAccess> {
  const { data } = await api.get<Resource<UserAccess>>(
    `/admin/companies/${company}/users/${userId}/access`,
  )
  return data.data
}

/** Пространства, которые после деактивации останутся без личного администратора. */
export async function fetchDeactivationImpact(
  company: string,
  userId: string,
): Promise<DeactivationImpact> {
  const { data } = await api.get<Resource<DeactivationImpact>>(
    `/admin/companies/${company}/users/${userId}/deactivation-impact`,
  )
  return data.data
}

export async function fetchGroups(company: string): Promise<Group[]> {
  const { data } = await api.get<Collection<Group>>(`/admin/companies/${company}/groups`)
  return data.data
}

export async function fetchGroup(company: string, id: string): Promise<Group> {
  const { data } = await api.get<Resource<Group>>(`/admin/companies/${company}/groups/${id}`)
  return data.data
}

export async function saveGroup(
  company: string,
  payload: { name: string; description: string | null },
  id?: string,
): Promise<Group> {
  const { data } = id
    ? await api.patch<Resource<Group>>(`/admin/companies/${company}/groups/${id}`, payload)
    : await api.post<Resource<Group>>(`/admin/companies/${company}/groups`, payload)
  return data.data
}

export async function setGroupArchived(
  company: string,
  id: string,
  archived: boolean,
): Promise<Group> {
  const action = archived ? 'archive' : 'restore'
  const { data } = await api.post<Resource<Group>>(
    `/admin/companies/${company}/groups/${id}/${action}`,
  )
  return data.data
}

export async function addGroupMember(
  company: string,
  groupId: string,
  userId: string,
): Promise<Group> {
  const { data } = await api.post<Resource<Group>>(
    `/admin/companies/${company}/groups/${groupId}/members`,
    {
      user_id: userId,
    },
  )
  return data.data
}

export async function removeGroupMember(
  company: string,
  groupId: string,
  userId: string,
): Promise<void> {
  await api.delete(`/admin/companies/${company}/groups/${groupId}/members/${userId}`)
}

/** Выдать или изменить доступ группы к пространству. */
export async function assignGroupSpace(
  company: string,
  groupId: string,
  spaceId: string,
  payload: { role: SpaceRole; own_cards_only: boolean },
): Promise<Group> {
  const { data } = await api.put<Resource<Group>>(
    `/admin/companies/${company}/groups/${groupId}/spaces/${spaceId}`,
    payload,
  )
  return data.data
}

export async function revokeGroupSpace(
  company: string,
  groupId: string,
  spaceId: string,
): Promise<void> {
  await api.delete(`/admin/companies/${company}/groups/${groupId}/spaces/${spaceId}`)
}
