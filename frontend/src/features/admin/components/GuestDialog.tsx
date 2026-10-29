import { useEffect, useMemo, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAdminCompanyId } from '@/features/admin/company'
import { useCurrentUser } from '@/features/auth/queries'
import { emailSchema } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { AdminUser, NodeGrantInput, RoleKey, UserAccess } from '@/shared/types/api'
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
import { useAddGuest, useGrantableNodes, useUpdateGuest, useUserAccess } from '../queries'
import { NodeGrantsField } from './NodeGrantsField'

/** День YYYY-MM-DD в часовом поясе профиля (поле type="date"; сервер считает срок по нему же). */
function localDay(iso: string | null, timeZone?: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(iso))
}

/**
 * «Добавить гостя» и «Изменить доступ гостя» (П2c): сотрудник другой компании получает личный доступ к пространствам
 * этой компании — роли без «Администратора», срок по желанию (пусто — без срока). Откуда он — не показывается.
 * Меняются только пространства, где автор выдаёт доступ (как на сервере); остальные выдачи гостя — для чтения.
 *
 * Пока доступ гостя и список пространств не загрузились — «Загрузка…», а не пустые строки (правила вида, раздел 7);
 * форма появляется уже с его значениями, фокус — на первом поле.
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
  const access = useUserAccess(guest?.id ?? '', guest !== null && open)
  const grantable = useGrantableNodes(company, open)
  const ready = grantable.isSuccess && (guest === null || access.isSuccess)

  // Личные выдачи гостя (только на пространства): где автор выдаёт доступ, — меняются; остальные — только показываются
  const nodeOfSpace = new Map(
    (grantable.data ?? []).flatMap((node) =>
      node.space ? [[node.space.id, node.id] as const] : [],
    ),
  )
  const personal =
    access.data?.spaces.flatMap((entry) =>
      entry.sources
        .filter((source) => source.type === 'personal' && source.folder === null)
        .map((source) => ({ entry, source })),
    ) ?? []
  const editable: NodeGrantInput[] = personal.flatMap(({ entry, source }) => {
    const nodeId = nodeOfSpace.get(entry.space.id)
    return nodeId ? [{ node_id: nodeId, roles: source.roles }] : []
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        closeLabel={tc('actions.close')}
        className="sm:max-w-2xl"
        // Форма ещё не на месте — фокус поставит она сама, когда появится
        onOpenAutoFocus={(event) => !ready && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {guest === null ? t('guests.addTitle') : t('guests.editTitle', { name: guest.name })}
          </DialogTitle>
          <DialogDescription>{t('guests.description')}</DialogDescription>
        </DialogHeader>
        {ready ? (
          // Пришли другие выдачи (обновление в фоне) — форма заново, с ними, как раньше делал reset
          <GuestForm
            key={JSON.stringify(editable)}
            company={company}
            guest={guest}
            editable={editable}
            readOnly={personal.filter(({ entry }) => !nodeOfSpace.has(entry.space.id))}
            nothingToGrant={nodeOfSpace.size === 0}
            onClose={onClose}
          />
        ) : access.isError || grantable.isError ? (
          <p className="text-destructive text-sm">{tc('errors.generic')}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function GuestForm({
  company,
  guest,
  editable,
  readOnly,
  nothingToGrant,
  onClose,
}: {
  company: string
  guest: AdminUser | null
  /** Выдачи гостя, которые автор может менять, — начальные строки формы. */
  editable: NodeGrantInput[]
  readOnly: {
    entry: UserAccess['spaces'][number]
    source: UserAccess['spaces'][number]['sources'][number]
  }[]
  /** Автору негде выдавать доступ: нового гостя добавить нельзя. */
  nothingToGrant: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: ta } = useTranslation('auth')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const add = useAddGuest()
  const update = useUpdateGuest()
  const form = useRef<HTMLFormElement>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: guest === null ? emailSchema(ta) : z.string(),
        expires_on: z.string(),
        grants: z
          .array(
            z.object({
              node_id: z.string(),
              roles: z.array(z.custom<RoleKey>()).min(1, ts('rolesField.required')),
            }),
          )
          .min(guest === null ? 1 : 0, t('guests.spacesRequired')),
      }),
    [guest, t, ta, ts],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      expires_on: localDay(guest?.guest?.expires_at ?? null, me?.timezone),
      grants: editable,
    },
  })

  // Окно открылось до загрузки (или уже с формой — тогда фокус поставил бы и Radix): первое поле формы
  useEffect(() => {
    if (!form.current?.contains(document.activeElement)) {
      form.current?.querySelector<HTMLElement>('input, select')?.focus()
    }
  }, [])

  const onSubmit = handleSubmit(async (values) => {
    const payload = { expires_on: values.expires_on || null, grants: values.grants }
    try {
      if (guest === null) {
        await add.mutateAsync({ email: values.email, ...payload })
        toast.success(t('guests.added', { email: values.email }))
      } else {
        await update.mutateAsync({ userId: guest.id, ...payload })
        toast.success(t('guests.updated'))
      }
      onClose()
    } catch (error) {
      const fields = getErrorBody(error)?.errors ?? {}
      const spaceError = Object.entries(fields).find(([key]) => key.startsWith('grants'))
      if (spaceError) setError('grants', { message: spaceError[1][0] })
      const known = ['email', 'expires_on'].some((key) => key in fields)
      if (!applyValidationErrors(error, setError) || (!known && !spaceError)) {
        // Ошибка не о поле формы (гостя уже убрали и т. п.) — сообщением
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-4" noValidate>
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
        name="grants"
        render={({ field }) => (
          <NodeGrantsField
            id="guest-spaces"
            company={company}
            value={field.value}
            onChange={field.onChange}
            forGuest
            emptyText={guest === null ? t('guests.spacesEmpty') : t('guests.spacesEmptyEdit')}
            error={
              errors.grants?.message ??
              errors.grants?.find?.((grant) => grant?.roles)?.roles?.message
            }
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
                  role: source.roles.map((role) => ts(`roles.${role}`)).join(', '),
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
        <Button type="button" variant="outline" onClick={onClose}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || (guest === null && nothingToGrant)}>
          {guest === null ? t('guests.add') : tc('actions.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}
