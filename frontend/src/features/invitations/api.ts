import { api, ensureCsrfCookie } from '@/shared/api/client'
import type { PublicInvitation, Resource, User } from '@/shared/types/api'

export async function fetchInvitation(token: string): Promise<PublicInvitation> {
  const { data } = await api.get<Resource<PublicInvitation>>(
    `/invitations/${encodeURIComponent(token)}`,
  )
  return data.data
}

export async function acceptInvitation(
  token: string,
  payload: { password: string; password_confirmation: string },
): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post<Resource<User>>(
    `/invitations/${encodeURIComponent(token)}/accept`,
    payload,
  )
  return data.data
}
