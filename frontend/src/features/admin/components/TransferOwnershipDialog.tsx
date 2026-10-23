import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useCurrentUser } from '@/features/auth/queries'
import { useAdminCompanyId } from '@/features/admin/company'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { DirectoryUser } from '@/shared/types/api'
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
import { useTransferOwnership } from '../queries'

/**
 * Передача владения (ADR-0017): только Владельцу. Новый Владелец — активный сотрудник, подтверждение — свой
 * пароль. После передачи текущий пользователь сразу становится администратором (интерфейс перечитывает права).
 */
export function TransferOwnershipDialog() {
  const company = useAdminCompanyId()
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<DirectoryUser | null>(null)
  const transfer = useTransferOwnership()

  const schema = useMemo(
    () =>
      z.object({
        user_id: z.string().min(1, t('users.transfer.userRequired')),
        password: z.string().min(1, t('users.transfer.passwordRequired')),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { user_id: '', password: '' },
  })

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
      setSelected(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await transfer.mutateAsync({ userId: values.user_id, password: values.password })
      toast.success(t('users.transfer.success', { name: selected?.name ?? '' }))
      close(false)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('users.transfer.button')}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('users.transfer.title')}</DialogTitle>
          <DialogDescription>{t('users.transfer.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            id="transfer-user"
            label={t('users.transfer.user')}
            error={errors.user_id?.message}
          >
            <UserPicker
              companyId={company}
              id="transfer-user"
              value={selected}
              onChange={(user) => {
                setSelected(user)
                setValue('user_id', user?.id ?? '', { shouldValidate: !!user })
              }}
              excludeIds={me ? [me.id] : []}
              onlyActive
              invalid={!!errors.user_id}
            />
          </FormField>
          <FormField
            id="transfer-password"
            label={t('users.transfer.password')}
            hint={t('users.transfer.passwordHint')}
            error={errors.password?.message}
          >
            <Input
              id="transfer-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {t('users.transfer.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
