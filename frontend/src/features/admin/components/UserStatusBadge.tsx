import { useTranslation } from 'react-i18next'
import type { User } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'

/**
 * Статус пользователя (в админке — в этой компании, П2c). Пользователь с отозванным приглашением формально
 * деактивирован, но показывается отдельным бейджем, чтобы не смешиваться с уволенными/отключёнными; учётную запись,
 * отключённую Владельцем, — тоже своим бейджем (вернуть может только он).
 */
export function UserStatusBadge({
  user,
}: {
  user: Pick<User, 'status' | 'invitation'> & { blocked?: boolean }
}) {
  const { t } = useTranslation()
  const { t: ta } = useTranslation('admin')
  const invitationState = user.invitation?.state

  if (user.blocked) {
    return <Badge variant="destructive">{ta('users.badges.blocked')}</Badge>
  }

  if (user.status === 'active') {
    return <Badge variant="success">{t('statuses.active')}</Badge>
  }
  if (user.status === 'invited') {
    return invitationState === 'expired' ? (
      <Badge variant="warning">{ta('users.badges.invitationExpired')}</Badge>
    ) : (
      <Badge variant="secondary">{t('statuses.invited')}</Badge>
    )
  }
  return invitationState === 'revoked' ? (
    <Badge variant="outline">{ta('users.badges.invitationRevoked')}</Badge>
  ) : (
    <Badge variant="destructive">{t('statuses.deactivated')}</Badge>
  )
}
