import { api } from '@/shared/api/client'
import type { Collection, Label, Resource } from '@/shared/types/api'

export interface LabelPayload {
  name: string
  color: string
}

/** Метки, доступные в пространстве: общие компании и метки пространства (включая архивные). */
export async function fetchSpaceLabels(spaceKey: string): Promise<Label[]> {
  const { data } = await api.get<Collection<Label>>(`/spaces/${spaceKey}/labels`)
  return data.data
}

/** Общие метки компании (админка). */
export async function fetchCompanyLabels(): Promise<Label[]> {
  const { data } = await api.get<Collection<Label>>('/admin/labels')
  return data.data
}

/** Создать метку: в пространстве или (spaceKey = null) общую метку компании. */
export async function createLabel(spaceKey: string | null, payload: LabelPayload): Promise<Label> {
  const url = spaceKey ? `/spaces/${spaceKey}/labels` : '/admin/labels'
  const { data } = await api.post<Resource<Label>>(url, payload)
  return data.data
}

export async function updateLabel(id: string, payload: LabelPayload): Promise<Label> {
  const { data } = await api.patch<Resource<Label>>(`/labels/${id}`, payload)
  return data.data
}

export async function setLabelArchived(id: string, archived: boolean): Promise<Label> {
  const { data } = await api.post<Resource<Label>>(
    `/labels/${id}/${archived ? 'archive' : 'restore'}`,
  )
  return data.data
}
