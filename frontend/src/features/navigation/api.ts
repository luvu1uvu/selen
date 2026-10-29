import { api } from '@/shared/api/client'
import type {
  AdminNavigation,
  Collection,
  MoveImpact,
  NavCompanyTree,
  NodeAccess,
  RoleKey,
} from '@/shared/types/api'

/**
 * Дерево пользователя по компаниям: только папки с доступными ему пространствами (ADR-0013, ADR-0024); название
 * компании — только если их несколько.
 */
export async function fetchNavigation(): Promise<NavCompanyTree[]> {
  const { data } = await api.get<Collection<NavCompanyTree>>('/navigation')
  return data.data
}

/** Полное дерево для «Структуры» — плоский список в порядке обхода. Изменения отвечают тем же деревом. */
export async function fetchAdminNavigation(company: string): Promise<AdminNavigation> {
  const { data } = await api.get<AdminNavigation>(`/admin/companies/${company}/navigation`)
  return data
}

export async function createFolder(
  company: string,
  payload: {
    name: string
    icon: string | null
    parent_id: string | null
  },
): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>(`/admin/companies/${company}/folders`, payload)
  return data
}

/** Название (только у папки) и/или иконка узла. */
export async function updateNavNode(
  company: string,
  id: string,
  payload: { name?: string; icon?: string | null },
): Promise<AdminNavigation> {
  const { data } = await api.patch<AdminNavigation>(
    `/admin/companies/${company}/nav-nodes/${id}`,
    payload,
  )
  return data
}

/** Перемещение: новый родитель (null — корень) и соседи, которых видел клиент (ADR-0007). */
export async function moveNavNode(
  company: string,
  id: string,
  payload: { parent_id: string | null; after_id?: string | null; before_id?: string | null },
): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>(
    `/admin/companies/${company}/nav-nodes/${id}/move`,
    payload,
  )
  return data
}

/** Удалить пустую папку навсегда (LATER-43): без вложенных папок и пространств, в том числе архивных. */
export async function deleteFolder(company: string, id: string): Promise<AdminNavigation> {
  const { data } = await api.delete<AdminNavigation>(`/admin/companies/${company}/folders/${id}`)
  return data
}

/** Архив или восстановление папки; при восстановлении — по желанию и архивных пространств прямо в ней. */
export async function setFolderArchived(
  company: string,
  id: string,
  archived: boolean,
  restoreSpaces = false,
): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>(
    `/admin/companies/${company}/folders/${id}/${archived ? 'archive' : 'restore'}`,
    archived ? undefined : { restore_spaces: restoreSpaces },
  )
  return data
}

/** Что изменит перемещение узла в доступе (П2d-1): кто получит, кто потеряет, где не останется управляющего. */
export async function fetchMoveImpact(
  company: string,
  id: string,
  parentId: string | null,
): Promise<MoveImpact> {
  const { data } = await api.get<{ data: MoveImpact }>(
    `/admin/companies/${company}/nav-nodes/${id}/move-impact`,
    { params: { parent_id: parentId ?? '' } },
  )
  return data.data
}

/** «Доступ…» папки или пространства (П2d-1): выдачи на узел и унаследованные с папок выше. */
export async function fetchNodeAccess(company: string, id: string): Promise<NodeAccess> {
  const { data } = await api.get<{ data: NodeAccess }>(
    `/admin/companies/${company}/nav-nodes/${id}/access`,
  )
  return data.data
}

/** Роли человека или группы на узле — набор целиком; отвечает обновлённым «Доступом…». */
export async function setNodeAccess(
  company: string,
  id: string,
  subject: { type: 'user' | 'group'; id: string },
  roles: RoleKey[],
): Promise<NodeAccess> {
  const { data } = await api.put<{ data: NodeAccess }>(
    `/admin/companies/${company}/nav-nodes/${id}/access/${subject.type}s/${subject.id}`,
    { roles },
  )
  return data.data
}

/** Снять доступ человека или группы к узлу (все роли на нём; унаследованные — на своей папке). */
export async function revokeNodeAccess(
  company: string,
  id: string,
  subject: { type: 'user' | 'group'; id: string },
): Promise<void> {
  await api.delete(
    `/admin/companies/${company}/nav-nodes/${id}/access/${subject.type}s/${subject.id}`,
  )
}
