import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAdminCompanyId } from '@/features/admin/company'
import { useCurrentUser } from '@/features/auth/queries'
import { emailSchema } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { AdminUser, SpaceGrantInput, SpaceRole } from '@/shared/types/api'
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
import { useAddGuest, useGrantableSpaces, useUpdateGuest, useUserAccess } from '../queries'
import { SpaceGrantsField } from './SpaceGrantsField'

/** День YYYY-MM-DD в часовом поясе профиля (поле type="date"; сервер считает срок по нему же). */
function localDay(iso: string | null, timeZone?: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(iso))
}

/**
 * «Добавить гостя» и «Изменить доступ гостя» (П2c): сотрудник другой компании получает личный доступ к пространствам
 * этой компании — роли без «Администратора», срок по желанию (пусто — без срока). Откуда он — не показывается.
 * Меняются только пространства, где автор выдаёт доступ (как на сервере); остальные выдачи гостя — для чтения.
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
  const { t: ta } = useTranslation('auth')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const add = useAddGuest()
  const update = useUpdateGuest()
  const access = useUserAccess(guest?.id ?? '', guest !== null && open)
  const grantable = useGrantableSpaces(company, open)

  const schema = useMemo(
    () =>
      z.object({
        email: guest === null ? emailSchema(ta) : z.string(),
        expires_on: z.string(),
        spaces: z
          .array(
            z.object({
              space_id: z.string(),
              role: z.custom<SpaceRole>(),
              own_cards_only: z.boolean().optional(),
            }),
          )
          .min(guest === null ? 1 : 0, t('guests.spacesRequired')),
      }),
    [guest, t, ta],
  )
  type FormValues = z.infer<typeof schema>

  // Личные выдачи гостя: в пространствах, где автор выдаёт доступ, — меняются; остальные — только показываются
  const grantableIds = new Set(grantable.data?.map((space) => space.id) ?? [])
  const personal =
    access.data?.spaces.flatMap((entry) =>
      entry.sources
        .filter((source) => source.type === 'personal')
        .map((source) => ({ entry, source })),
    ) ?? []
  const editableGrants: SpaceGrantInput[] = personal
    .filter(({ entry }) => grantableIds.has(entry.space.id))
    .map(({ entry, source }) => ({
      space_id: entry.space.id,
      role: source.role,
      own_cards_only: source.own_cards_only,
    }))
  const readOnly = personal.filter(({ entry }) => !grantableIds.has(entry.space.id))
  const ready = guest === null || (access.isSuccess && grantable.isSuccess)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', expires_on: '', spaces: [] },
  })

  // Изменение: срок и пространства — из его доступа, когда он загрузился
  const initial = guest && ready ? JSON.stringify(editableGrants) : null
  useEffect(() => {
    if (open && guest && initial !== null) {
      reset({
        email: '',
        expires_on: localDay(guest.guest?.expires_at ?? null, me?.timezone),
        spaces: JSON.parse(initial) as SpaceGrantInput[],
      })
    }
  }, [open, guest, initial, me?.timezone, reset])

  const close = () => {
    reset({ email: '', expires_on: '', spaces: [] })
    onClose()
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = { expires_on: values.expires_on || null, spaces: values.spaces }
    try {
      if (guest === null) {
        await add.mutateAsync({ email: values.email, ...payload })
        toast.success(t('guests.added', { email: values.email }))
      } else {
        await update.mutateAsync({ userId: guest.id, ...payload })
        toast.success(t('guests.updated'))
      }
      close()
    } catch (error) {
      const fields = getErrorBody(error)?.errors ?? {}
      const spaceError = Object.entries(fields).find(([key]) => key.startsWith('spaces'))
      if (spaceError) setError('spaces', { message: spaceError[1][0] })
      const known = ['email', 'expires_on'].some((key) => key in fields)
      if (!applyValidationErrors(error, setError) || (!known && !spaceError)) {
        // Ошибка не о поле формы (гостя уже убрали и т. п.) — сообщением
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

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
            <FormField id="guest-email" label={t('guests.email')} error={errors.email?.message}>
              <Input
                id="guest-email"
                type="email"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </FormField>
          )}
          <Controller
            control={control}
            name="spaces"
            render={({ field }) => (
              <SpaceGrantsField
                id="guest-spaces"
                company={company}
                value={field.value}
                onChange={field.onChange}
                withoutAdmin
                error={errors.spaces?.message}
              />
            )}
          />
          {readOnly.length > 0 && (
            <div className="grid gap-1 text-sm">
              <p className="text-muted-foreground">{t('guests.otherSpaces')}</p>
              <ul className="grid gap-1">
                {readOnly.map(({ entry, source }) => (
                  <li key={entry.space.id}>
                    {t('guests.otherSpace', {
                      name: entry.space.name,
                      key: entry.space.key,
                      role: ts(`roles.${source.role}`),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <FormField
            id="guest-expires"
            label={t('guests.expires')}
            hint={t('guests.expiresHint')}
            error={errors.expires_on?.message}
          >
            <Input
              id="guest-expires"
              type="date"
              aria-invalid={!!errors.expires_on}
              className="sm:w-48"
              {...register('expires_on')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !ready}>
              {guest === null ? t('guests.add') : tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
