import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RoleKey } from '@/shared/types/api'
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
  groupDirectory: (company: string) => ['groups', 'directory', company] as const,
  directory: (company: string, search: string, homes = false) =>
    ['users', 'directory', company, search, homes] as const,
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

/**
 * Справочник людей компании (ADR-0024): в пространстве — его компании, в админке — компании админки; homes — только
 * её «дома» (состав группы).
 */
export function useDirectory(company: string, search: string, enabled = true, homes = false) {
  return useQuery({
    queryKey: spaceKeys.directory(company, search, homes),
    queryFn: () => searchDirectory(company, search, homes),
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
    mutationFn: (payload: { user_id: string; roles: RoleKey[] }) => addMember(key, payload),
    onSuccess: invalidate,
  })
}

/** Личные роли участника на пространстве (П2d-1). */
export function useUpdateMember(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: RoleKey[] }) =>
      updateMember(key, userId, { roles }),
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

export function useGroupDirectory(company: string, enabled = true) {
  return useQuery({
    queryKey: spaceKeys.groupDirectory(company),
    queryFn: () => fetchGroupDirectory(company),
    enabled,
  })
}

/** Доступ группы меняет и список людей (их источники) — обновляем всё пространство. */
export function useAddSpaceGroup(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (payload: { group_id: string; roles: RoleKey[] }) => addSpaceGroup(key, payload),
    onSuccess: invalidate,
  })
}

export function useUpdateSpaceGroup(key: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: ({ groupId, roles }: { groupId: string; roles: RoleKey[] }) =>
      updateSpaceGroup(key, groupId, { roles }),
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
