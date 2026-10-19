import { api } from '@/shared/api/client'
import type { Resource, User } from '@/shared/types/api'

export async function updateProfile(payload: { name: string; timezone: string }): Promise<User> {
  const { data } = await api.patch<Resource<User>>('/profile', payload)
  return data.data
}

export async function changePassword(payload: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<void> {
  await api.put('/profile/password', payload)
}
