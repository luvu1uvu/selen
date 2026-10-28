import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAdminCompanyId } from '@/features/admin/company'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { AdminUser, SpaceGrantInput } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { useAddGuest, useUpdateGuest, useUserAccess } from '../queries'
import { SpaceGrantsField } from './SpaceGrantsField'

/** День YYYY-MM-DD по часовому поясу браузера (поле type="date"). */
function localDay(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * «Добавить гостя» и «Изменить доступ гостя» (П2c): сотрудник другой компании получает личный доступ к пространствам
 * этой компании — роли без «Администратора», срок по желанию (пусто — без срока). Откуда он — не показывается.
 */
export function GuestDialog({
  open,
  guest,
  onClose,
}: {
  open: boolean
  /** null — новый гость. */
  guest: AdminUser | null
  onClose: () => void
}) {
  const company = useAdminCompanyId()
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const add = useAddGuest()
  const update = useUpdateGuest()
  const access = useUserAccess(guest?.id ?? '', guest !== null && open)
  const [email, setEmail] = useState('')
  // null — срок не меняли (у гостя — прежний); '' — без срока
  const [expiresOn, setExpiresOn] = useState<string | null>(null)
  const [spaces, setSpaces] = useState<SpaceGrantInput[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Изменение: пространства и срок — из его доступа (личные выдачи), пока пользователь их не менял
  const current: SpaceGrantInput[] =
    access.data?.spaces.flatMap((entry) =>
      entry.sources
        .filter((source) => source.type === 'personal')
        .map((source) => ({
          space_id: entry.space.id,
          role: source.role,
          own_cards_only: source.own_cards_only,
        })),
    ) ?? []
  const grants = spaces ?? (guest ? current : [])
  const expires = expiresOn ?? (guest ? localDay(guest.guest?.expires_at ?? null) : '')

  const close = () => {
    setEmail('')
    setExpiresOn(null)
    setSpaces(null)
    setErrors({})
    onClose()
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (guest === null && grants.length === 0) {
      setErrors({ spaces: t('guests.spacesRequired') })
      return
    }
    try {
      const payload = { expires_on: expires || null, spaces: grants }
      if (guest === null) {
        await add.mutateAsync({ email, ...payload })
        toast.success(t('guests.added', { email }))
      } else {
        await update.mutateAsync({ userId: guest.id, ...payload })
        toast.success(t('guests.updated'))
      }
      close()
    } catch (error) {
      const body = getErrorBody(error)
      if (body?.errors) {
        setErrors(
          Object.fromEntries(
            Object.entries(body.errors).map(([key, messages]) => [
              key.startsWith('spaces') ? 'spaces' : key,
              messages[0] ?? '',
            ]),
          ),
        )
      } else {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent closeLabel={tc('actions.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {guest === null ? t('guests.addTitle') : t('guests.editTitle', { name: guest.name })}
          </DialogTitle>
          <DialogDescription>{t('guests.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {guest === null && (
            <FormField id="guest-email" label={t('guests.email')} error={errors.email}>
              <Input
                id="guest-email"
                type="email"
                value={email}
                aria-invalid={!!errors.email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
          )}
          <SpaceGrantsField
            id="guest-spaces"
            company={company}
            value={grants}
            onChange={setSpaces}
            withoutAdmin
            error={errors.spaces}
          />
          <FormField
            id="guest-expires"
            label={t('guests.expires')}
            hint={t('guests.expiresHint')}
            error={errors.expires_on}
          >
            <Input
              id="guest-expires"
              type="date"
              value={expires}
              aria-invalid={!!errors.expires_on}
              onChange={(event) => setExpiresOn(event.target.value)}
              className="sm:w-48"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={add.isPending || update.isPending || (guest !== null && access.isPending)}
            >
              {guest === null ? t('guests.add') : tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
