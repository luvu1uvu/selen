import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { formatDate } from '@/shared/lib/dates'
import type { GuestMembership } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'

/** Гость компании (П2c): срок — по желанию; истёк — доступа нет, срок можно продлить. Список и страница человека. */
export function GuestBadge({ guest }: { guest: GuestMembership }) {
  const { t } = useTranslation('admin')
  const { data: me } = useCurrentUser()
  return (
    <Badge variant={guest.expired ? 'warning' : 'outline'}>
      {guest.expired
        ? t('users.badges.guestExpired')
        : guest.expires_at
          ? t('users.badges.guestUntil', { date: formatDate(guest.expires_at, me?.timezone) })
          : t('users.badges.guest')}
    </Badge>
  )
}
