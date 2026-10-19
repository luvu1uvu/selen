import { api } from '@/shared/api/client'
import type { AdminNavigation, Collection, NavTreeNode } from '@/shared/types/api'

/** Дерево пользователя: только папки с доступными ему пространствами (ADR-0013). */
export async function fetchNavigation(): Promise<NavTreeNode[]> {
  const { data } = await api.get<Collection<NavTreeNode>>('/navigation')
  return data.data
}

/** Полное дерево для «Структуры» — плоский список в порядке обхода. Изменения отвечают тем же деревом. */
export async function fetchAdminNavigation(): Promise<AdminNavigation> {
  const { data } = await api.get<AdminNavigation>('/admin/navigation')
  return data
}

export async function createFolder(payload: {
  name: string
  icon: string | null
  parent_id: string | null
}): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>('/admin/folders', payload)
  return data
}

/** Название (только у папки) и/или иконка узла. */
export async function updateNavNode(
  id: string,
  payload: { name?: string; icon?: string | null },
): Promise<AdminNavigation> {
  const { data } = await api.patch<AdminNavigation>(`/admin/nav-nodes/${id}`, payload)
  return data
}

/** Перемещение: новый родитель (null — корень) и соседи, которых видел клиент (ADR-0007). */
export async function moveNavNode(
  id: string,
  payload: { parent_id: string | null; after_id?: string | null; before_id?: string | null },
): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>(`/admin/nav-nodes/${id}/move`, payload)
  return data
}

/** Удалить пустую папку навсегда (LATER-43): без вложенных папок и пространств, в том числе архивных. */
export async function deleteFolder(id: string): Promise<AdminNavigation> {
  const { data } = await api.delete<AdminNavigation>(`/admin/folders/${id}`)
  return data
}

/** Архив или восстановление папки; при восстановлении — по желанию и архивных пространств прямо в ней. */
export async function setFolderArchived(
  id: string,
  archived: boolean,
  restoreSpaces = false,
): Promise<AdminNavigation> {
  const { data } = await api.post<AdminNavigation>(
    `/admin/folders/${id}/${archived ? 'archive' : 'restore'}`,
    archived ? undefined : { restore_spaces: restoreSpaces },
  )
  return data
}
