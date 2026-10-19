import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpaceRole } from '@/shared/types/api'
import {
  addMember,
  addSpaceGroup,
  fetchGroupDirectory,
  fetchMembers,
  fetchSpaceGroups,
  fetchSpace,
  fetchSpaces,
  removeMember,
  removeSpaceGroup,
  searchDirectory,
  updateMember,
  updateSpace,
  updateSpaceGroup,
} from './api'

export const spaceKeys = {
  all: ['spaces'] as const,
  list: () => ['spaces', 'list'] as const,
  detail: (key: string) => ['spaces', 'detail', key] as const,
  members: (key: string) => ['spaces', 'members', key] as const,
  groups: (key: string) => ['spaces', 'groups', key] as const,
  groupDirectory: () => ['groups', 'directory'] as const,
  directory: (search: string) => ['users', 'directory', search] as const,
}

/** Пространства текущего пользователя (сайдбар, главная). */
export function useSpaces() {
  return useQuery({ queryKey: spaceKeys.list(), queryFn: fetchSpaces })
}

export function useSpace(key: string) {
  return useQuery({ queryKey: spaceKeys.detail(key), queryFn: () => fetchSpace(key) })
}

export function useMembers(key: string, enabled = true) {
  return useQuery({
    queryKey: spaceKeys.members(key),
    queryFn: () => fetchMembers(key),
    enabled,
  })
}

export function useDirectory(search: string, enabled = true) {
  return useQuery({
    queryKey: spaceKeys.directory(search),
    queryFn: () => searchDirectory(search),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Состав участников и роли влияют на права в пространстве — обновляем всё, что с ним связано. */
function useInvalidateSpaces() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: spaceKeys.all })
}

export function useUpdateSpace(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (payload: { name: string; description: string | null }) =>
      updateSpace(key, payload),
    onSuccess: invalidate,
  })
}

export function useAddMember(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (payload: { user_id: string; role: SpaceRole }) => addMember(key, payload),
    onSuccess: invalidate,
  })
}

/** Роль участника и/или режим «только свои карточки». */
export function useUpdateMember(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: ({
      userId,
      ...payload
    }: {
      userId: string
      role?: SpaceRole
      own_cards_only?: boolean
    }) => updateMember(key, userId, payload),
    onSuccess: invalidate,
  })
}

export function useRemoveMember(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (userId: string) => removeMember(key, userId),
    onSuccess: invalidate,
  })
}

export function useSpaceGroups(key: string, enabled = true) {
  return useQuery({
    queryKey: spaceKeys.groups(key),
    queryFn: () => fetchSpaceGroups(key),
    enabled,
  })
}

export function useGroupDirectory(enabled = true) {
  return useQuery({ queryKey: spaceKeys.groupDirectory(), queryFn: fetchGroupDirectory, enabled })
}

/** Доступ группы меняет и список людей (их источники) — обновляем всё пространство. */
export function useAddSpaceGroup(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (payload: { group_id: string; role: SpaceRole; own_cards_only: boolean }) =>
      addSpaceGroup(key, payload),
    onSuccess: invalidate,
  })
}

export function useUpdateSpaceGroup(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: ({
      groupId,
      ...payload
    }: {
      groupId: string
      role?: SpaceRole
      own_cards_only?: boolean
    }) => updateSpaceGroup(key, groupId, payload),
    onSuccess: invalidate,
  })
}

export function useRemoveSpaceGroup(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (groupId: string) => removeSpaceGroup(key, groupId),
    onSuccess: invalidate,
  })
}
