import type { User } from '@/shared/types/api'

type WithRole = Pick<User, 'role'> | null | undefined

/** Системный администратор — администратор или Владелец (ADR-0017). Доступ всё равно проверяет API. */
export function isSystemAdmin(user: WithRole): boolean {
  return user?.role === 'admin' || user?.role === 'owner'
}

/** Владелец — единственный; назначает администраторов и передаёт владение (ADR-0017). */
export function isOwner(user: WithRole): boolean {
  return user?.role === 'owner'
}
