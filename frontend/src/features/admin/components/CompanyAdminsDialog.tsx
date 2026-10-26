import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { getErrorMessage } from '@/shared/api/errors'
import type { DirectoryUser } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { useCompanies, useSetCompanyAdmin } from '../queries'

/**
 * Администраторы компании (экран Владельца «Компании», ADR-0024): назначить из её сотрудников, снять. То же действие,
 * что «Сделать администратором» в её «Пользователях». companyId = null — диалог закрыт.
 */
export function CompanyAdminsDialog({
  companyId,
  onClose,
}: {
  companyId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const company = useCompanies().data?.find((item) => item.id === companyId)
  const setAdmin = useSetCompanyAdmin()
  const [user, setUser] = useState<DirectoryUser | null>(null)

  const run = async (userId: string, admin: boolean, success: string) => {
    if (!companyId) return
    try {
      await setAdmin.mutateAsync({ company: companyId, userId, admin })
      toast.success(success)
      setUser(null)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <Dialog
      open={companyId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setUser(null)
          onClose()
        }
      }}
    >
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('companies.admins.title', { name: company?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('companies.admins.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {company && company.admins.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('companies.admins.none')}</p>
          )}
          {company && company.admins.length > 0 && (
            <ul className="divide-y rounded-md border" aria-label={t('companies.admins.list')}>
              {company.admins.map((admin) => (
                <li key={admin.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {admin.name}{' '}
                      {admin.status === 'deactivated' && (
                        <Badge variant="outline">{tc('statuses.deactivated')}</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{admin.email}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setAdmin.isPending}
                    onClick={() =>
                      run(admin.id, false, t('companies.admins.removed', { name: admin.name }))
                    }
                  >
                    {t('companies.admins.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {companyId && (
            <div className="grid gap-2">
              <Label htmlFor="company-admin-add">{t('companies.admins.add')}</Label>
              <UserPicker
                id="company-admin-add"
                companyId={companyId}
                value={user}
                onChange={setUser}
                // Владелец — и так администратор всех компаний: назначать его некуда
                excludeIds={[
                  ...(company?.admins.map((admin) => admin.id) ?? []),
                  ...(me ? [me.id] : []),
                ]}
                homes
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc('actions.close')}
          </Button>
          <Button
            disabled={!user || setAdmin.isPending}
            onClick={() =>
              user && run(user.id, true, t('companies.admins.assigned', { name: user.name }))
            }
          >
            {t('companies.admins.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
