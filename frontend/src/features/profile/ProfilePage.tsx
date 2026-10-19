import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { isOwner } from '@/shared/lib/roles'
import { Badge } from '@/shared/ui/badge'
import { ChangePasswordForm } from './ChangePasswordForm'
import { ProfileForm } from './ProfileForm'

export function ProfilePage() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { data: user } = useCurrentUser()

  if (!user) return null

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
        {t('title')}
        {isOwner(user) && (
          <Badge variant="secondary" title={t('ownerHint')}>
            {tc('roles.owner')}
          </Badge>
        )}
      </h1>
      <ProfileForm user={user} />
      <ChangePasswordForm />
    </div>
  )
}
