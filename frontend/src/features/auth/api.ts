import { api, ensureCsrfCookie } from '@/shared/api/client'
import type { Resource, User } from '@/shared/types/api'

export interface LoginPayload {
  email: string
  password: string
  remember: boolean
}

export interface ResetPasswordPayload {
  token: string
  email: string
  password: string
  password_confirmation: string
}

export async function fetchCurrentUser(): Promise<User> {
  const { data } = await api.get<Resource<User>>('/auth/me')
  return data.data
}

export async function login(payload: LoginPayload): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post<Resource<User>>('/auth/login', payload)
  return data.data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function requestPasswordReset(email: string): Promise<void> {
  await ensureCsrfCookie()
  await api.post('/auth/forgot-password', { email })
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await ensureCsrfCookie()
  await api.post('/auth/reset-password', payload)
}
