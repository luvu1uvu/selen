import { useTranslation } from 'react-i18next'
import type { InvitationState } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'

const variants = {
  pending: 'secondary',
  expired: 'warning',
  accepted: 'success',
  revoked: 'outline',
  superseded: 'outline',
} as const

export function InvitationStateBadge({ state }: { state: InvitationState }) {
  const { t } = useTranslation('admin')
  return <Badge variant={variants[state]}>{t(`invitations.states.${state}`)}</Badge>
}
