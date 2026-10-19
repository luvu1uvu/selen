import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorStatus } from '@/shared/api/errors'
import type { User } from '@/shared/types/api'
import { fetchCurrentUser, login, logout, type LoginPayload } from './api'

/** Ключ кеша текущего пользователя. null — пользователь не вошёл. */
export const currentUserKey = ['auth', 'me'] as const

async function fetchCurrentUserOrNull(): Promise<User | null> {
  try {
    return await fetchCurrentUser()
  } catch (error) {
    if (getErrorStatus(error) === 401) return null
    throw error
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUserOrNull,
    staleTime: 60_000,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (user) => queryClient.setQueryData(currentUserKey, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(currentUserKey, null)
    },
  })
}
