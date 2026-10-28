import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useCurrentUser } from '@/features/auth/queries'
import { emailSchema } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
import { adminCompanies, companyModeContext, isOwner } from '@/shared/lib/roles'
import type { SpaceGrantInput } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/select'
import { hasCompanyPermission, useAdminCompanyId } from '../company'
import { useInviteUser } from '../queries'
import { SpaceGrantsField } from './SpaceGrantsField'

/**
 * «Пригласить» (П2c): компания — у кого приглашать можно в несколько, выбирает её явно; сразу — доступ к пространствам
 * с ролью (по желанию). Email существующего сотрудника другой компании — не ошибка: он сразу добавляется («Сотрудник
 * добавлен», решение PM 23.10, В8).
 */
export function InviteUserDialog() {
  const { t } = useTranslation('admin')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const inviteMutation = useInviteUser()
  const current = useAdminCompanyId()
  const companies = adminCompanies(me).filter((item) =>
    hasCompanyPermission(item, 'company.invite_users'),
  )
  const [chosen, setChosen] = useState<string | null>(null)
  const company = chosen ?? current
  const [spaces, setSpaces] = useState<SpaceGrantInput[]>([])
  const [spacesError, setSpacesError] = useState<string>()
  // Пригласить администратора может только Владелец (ADR-0017); проверяет и сервер
  const canInviteAdmin = isOwner(me)

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('invite.nameRequired')).max(255),
        email: emailSchema(ta),
        role: z.enum(['admin', 'member']),
      }),
    [t, ta],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'member' },
  })

  const clear = () => {
    reset()
    setChosen(null)
    setSpaces([])
    setSpacesError(undefined)
  }

  const onSubmit = handleSubmit(async (values) => {
    setSpacesError(undefined)
    try {
      const result = await inviteMutation.mutateAsync({ company, ...values, spaces })
      toast.success(
        result.result === 'added'
          ? t('invite.added', { name: result.user.name })
          : t('invite.success', { email: values.email }),
      )
      clear()
      setOpen(false)
    } catch (error) {
      const spaceError = Object.entries(getErrorBody(error)?.errors ?? {}).find(([key]) =>
        key.startsWith('spaces'),
      )
      if (spaceError) setSpacesError(spaceError[1][0])
      if (!applyValidationErrors(error, setError) && !spaceError) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) clear()
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('users.inviteButton')}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc('actions.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('invite.title')}</DialogTitle>
          <DialogDescription>
            {t('invite.description', { context: companyModeContext(me) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {companies.length > 1 && (
            <FormField id="invite-company" label={t('invite.company')}>
              <NativeSelect
                id="invite-company"
                value={company}
                onChange={(event) => {
                  setChosen(event.target.value)
                  setSpaces([])
                }}
              >
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <FormField id="invite-name" label={t('invite.name')} error={errors.name?.message}>
            <Input id="invite-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField id="invite-email" label={t('invite.email')} error={errors.email?.message}>
            <Input
              id="invite-email"
              type="email"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </FormField>
          <FormField
            id="invite-role"
            label={t('invite.role')}
            hint={canInviteAdmin ? undefined : t('invite.adminOnlyOwner')}
            error={errors.role?.message}
          >
            <NativeSelect id="invite-role" {...register('role')}>
              <option value="member">{tc('roles.member')}</option>
              {canInviteAdmin && <option value="admin">{tc('roles.admin')}</option>}
            </NativeSelect>
          </FormField>
          <SpaceGrantsField
            id="invite-spaces"
            company={company}
            value={spaces}
            onChange={setSpaces}
            error={spacesError}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t('invite.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
