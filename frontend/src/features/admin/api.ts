import { api } from '@/shared/api/client'
import type {
  AdminSpace,
  AdminUser,
  AssignableRole,
  CardType,
  Collection,
  Company,
  CompanyPermission,
  DeactivationImpact,
  EventLogEntry,
  GrantableSpace,
  Group,
  GroupCompanyPermission,
  Invitation,
  InviteResult,
  Paginated,
  Resource,
  SpaceGrantInput,
  SpaceRole,
  TransferImpact,
  TrashedCard,
  UserAccess,
  UserCompanyPermission,
  UserStatusFilter,
} from '@/shared/types/api'

export interface UserFilters {
  /** Статус в компании; guest — гости (П2c). */
  status?: UserStatusFilter
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

/** Деактивировать в компании; successorId — кому передать доступ (П2c). */
export async function deactivateUser(
  company: string,
  userId: string,
  successorId?: string | null,
): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/deactivate`,
    successorId ? { successor_id: successorId } : {},
  )
  return data.data
}

/** Отключить или включить учётную запись — только Владелец (П2c). */
export async function setUserBlocked(
  company: string,
  userId: string,
  blocked: boolean,
): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/users/${userId}/${blocked ? 'block' : 'unblock'}`,
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
    spaces?: SpaceGrantInput[]
  },
): Promise<InviteResult> {
  const { data } = await api.post<Resource<InviteResult>>(
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
/** account — после отключения учётной записи Владельцем: по всем компаниям человека (П2c). */
export async function fetchDeactivationImpact(
  company: string,
  userId: string,
  account = false,
): Promise<DeactivationImpact> {
  const { data } = await api.get<Resource<DeactivationImpact>>(
    `/admin/companies/${company}/users/${userId}/deactivation-impact`,
    { params: account ? { account: 1 } : {} },
  )
  return data.data
}

export async function fetchTransferImpact(
  company: string,
  userId: string,
): Promise<TransferImpact> {
  const { data } = await api.get<Resource<TransferImpact>>(
    `/admin/companies/${company}/users/${userId}/transfer-impact`,
  )
  return data.data
}

/** Пространства, где можно выдать доступ приглашённому и гостю (П2c). */
export async function fetchGrantableSpaces(company: string): Promise<GrantableSpace[]> {
  const { data } = await api.get<Collection<GrantableSpace>>(
    `/admin/companies/${company}/grantable-spaces`,
  )
  return data.data
}

/** Гости компании (П2c): expires_on — день (YYYY-MM-DD) или null — без срока. */
export async function addGuest(
  company: string,
  payload: { email: string; expires_on: string | null; spaces: SpaceGrantInput[] },
): Promise<AdminUser> {
  const { data } = await api.post<Resource<AdminUser>>(
    `/admin/companies/${company}/guests`,
    payload,
  )
  return data.data
}

export async function updateGuest(
  company: string,
  userId: string,
  payload: { expires_on: string | null; spaces: SpaceGrantInput[] },
): Promise<AdminUser> {
  const { data } = await api.put<Resource<AdminUser>>(
    `/admin/companies/${company}/guests/${userId}`,
    payload,
  )
  return data.data
}

export async function removeGuest(company: string, userId: string): Promise<void> {
  await api.delete(`/admin/companies/${company}/guests/${userId}`)
}

/** «Права компании» человека и группы (П2c). */
export async function fetchUserPermissions(
  company: string,
  userId: string,
): Promise<UserCompanyPermission[]> {
  const { data } = await api.get<Collection<UserCompanyPermission>>(
    `/admin/companies/${company}/users/${userId}/permissions`,
  )
  return data.data
}

export async function saveUserPermissions(
  company: string,
  userId: string,
  permissions: CompanyPermission[],
): Promise<UserCompanyPermission[]> {
  const { data } = await api.put<Collection<UserCompanyPermission>>(
    `/admin/companies/${company}/users/${userId}/permissions`,
    { permissions },
  )
  return data.data
}

export async function fetchGroupPermissions(
  company: string,
  groupId: string,
): Promise<GroupCompanyPermission[]> {
  const { data } = await api.get<Collection<GroupCompanyPermission>>(
    `/admin/companies/${company}/groups/${groupId}/permissions`,
  )
  return data.data
}

export async function saveGroupPermissions(
  company: string,
  groupId: string,
  permissions: CompanyPermission[],
): Promise<GroupCompanyPermission[]> {
  const { data } = await api.put<Collection<GroupCompanyPermission>>(
    `/admin/companies/${company}/groups/${groupId}/permissions`,
    { permissions },
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
