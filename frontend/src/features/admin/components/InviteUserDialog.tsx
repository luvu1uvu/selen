import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useCurrentUser } from '@/features/auth/queries'
import { emailSchema } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { isOwner } from '@/shared/lib/roles'
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
import { useInviteUser } from '../queries'

export function InviteUserDialog() {
  const { t } = useTranslation('admin')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const inviteMutation = useInviteUser()
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

  const onSubmit = handleSubmit(async (values) => {
    try {
      await inviteMutation.mutateAsync(values)
      toast.success(t('invite.success', { email: values.email }))
      reset()
      setOpen(false)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('users.inviteButton')}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('invite.title')}</DialogTitle>
          <DialogDescription>{t('invite.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
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
