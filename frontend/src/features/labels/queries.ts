import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { boardKeys } from '@/features/boards/queries'
import { useAdminCompanyId } from '@/features/admin/company'
import { cardKeys } from '@/features/cards/queries'
import {
  createLabel,
  fetchCompanyLabels,
  fetchSpaceLabels,
  setLabelArchived,
  updateLabel,
  type LabelPayload,
} from './api'

export const labelKeys = {
  all: ['labels'] as const,
  space: (spaceKey: string) => ['labels', 'space', spaceKey] as const,
  company: (company: string) => ['labels', 'company', company] as const,
}

export function useSpaceLabels(spaceKey: string, enabled = true) {
  return useQuery({
    queryKey: labelKeys.space(spaceKey),
    queryFn: () => fetchSpaceLabels(spaceKey),
    enabled,
  })
}

export function useCompanyLabels() {
  const company = useAdminCompanyId()
  return useQuery({
    queryKey: labelKeys.company(company),
    queryFn: () => fetchCompanyLabels(company),
  })
}

/** Название и цвет метки видны на досках и в карточках — перечитываем и их. */
function useLabelsChanged() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: labelKeys.all }),
      queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      queryClient.invalidateQueries({ queryKey: cardKeys.all }),
    ])
}

/** Создание (без id) или изменение метки. spaceKey = null — общая метка компании. */
export function useSaveLabel(spaceKey: string | null) {
  const changed = useLabelsChanged()
  // Компания общей метки — компании админки (метки пространства создаются в его компании на сервере)
  const company = useAdminCompanyId()
  return useMutation({
    mutationFn: ({ id, ...payload }: LabelPayload & { id?: string }) =>
      id ? updateLabel(id, payload) : createLabel(company, spaceKey, payload),
    onSuccess: changed,
  })
}

export function useSetLabelArchived() {
  const changed = useLabelsChanged()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setLabelArchived(id, archived),
    onSuccess: changed,
  })
}
