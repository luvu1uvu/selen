import { api } from '@/shared/api/client'
import type {
  Collection,
  DirectoryGroup,
  DirectoryUser,
  Resource,
  Space,
  SpaceGroupGrant,
  SpacePerson,
  SpaceRole,
} from '@/shared/types/api'

export async function fetchSpaces(): Promise<Space[]> {
  const { data } = await api.get<Collection<Space>>('/spaces')
  return data.data
}

export async function fetchSpace(key: string): Promise<Space> {
  const { data } = await api.get<Resource<Space>>(`/spaces/${key}`)
  return data.data
}

export async function updateSpace(
  key: string,
  payload: { name: string; description: string | null },
): Promise<Space> {
  const { data } = await api.patch<Resource<Space>>(`/spaces/${key}`, payload)
  return data.data
}

/** Все, у кого есть доступ к пространству: лично и через группы. */
export async function fetchMembers(key: string): Promise<SpacePerson[]> {
  const { data } = await api.get<Collection<SpacePerson>>(`/spaces/${key}/members`)
  return data.data
}

export async function addMember(
  key: string,
  payload: { user_id: string; role: SpaceRole },
): Promise<SpacePerson> {
  const { data } = await api.post<Resource<SpacePerson>>(`/spaces/${key}/members`, payload)
  return data.data
}

/** Роль и/или режим «только свои карточки» личного участия. */
export async function updateMember(
  key: string,
  userId: string,
  payload: { role?: SpaceRole; own_cards_only?: boolean },
): Promise<SpacePerson> {
  const { data } = await api.patch<Resource<SpacePerson>>(
    `/spaces/${key}/members/${userId}`,
    payload,
  )
  return data.data
}

export async function removeMember(key: string, userId: string): Promise<void> {
  await api.delete(`/spaces/${key}/members/${userId}`)
}

/** Сотрудники компании для выбора (ADR-0024: только её люди) — компания пространства или админки. */
export async function searchDirectory(company: string, search: string): Promise<DirectoryUser[]> {
  const { data } = await api.get<Collection<DirectoryUser>>(
    `/companies/${company}/users/directory`,
    {
      params: { search: search || undefined },
    },
  )
  return data.data
}

/** Группы с доступом к пространству (вкладка «Группы»). */
export async function fetchSpaceGroups(key: string): Promise<SpaceGroupGrant[]> {
  const { data } = await api.get<Collection<SpaceGroupGrant>>(`/spaces/${key}/groups`)
  return data.data
}

export async function addSpaceGroup(
  key: string,
  payload: { group_id: string; role: SpaceRole; own_cards_only: boolean },
): Promise<SpaceGroupGrant> {
  const { data } = await api.post<Resource<SpaceGroupGrant>>(`/spaces/${key}/groups`, payload)
  return data.data
}

export async function updateSpaceGroup(
  key: string,
  groupId: string,
  payload: { role?: SpaceRole; own_cards_only?: boolean },
): Promise<SpaceGroupGrant> {
  const { data } = await api.patch<Resource<SpaceGroupGrant>>(
    `/spaces/${key}/groups/${groupId}`,
    payload,
  )
  return data.data
}

export async function removeSpaceGroup(key: string, groupId: string): Promise<void> {
  await api.delete(`/spaces/${key}/groups/${groupId}`)
}

/** Активные группы компании для выдачи доступа (администратор компании и администраторы её пространств). */
export async function fetchGroupDirectory(company: string): Promise<DirectoryGroup[]> {
  const { data } = await api.get<Collection<DirectoryGroup>>(
    `/companies/${company}/groups/directory`,
  )
  return data.data
}
