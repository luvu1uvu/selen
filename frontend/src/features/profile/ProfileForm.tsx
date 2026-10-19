import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { currentUserKey } from '@/features/auth/queries'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { User } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/select'
import { updateProfile } from './api'

/** Список часовых поясов из браузера (IANA). */
function timezones(current: string): string[] {
  const all = Intl.supportedValuesOf?.('timeZone') ?? []
  return all.includes(current) ? all : [current, ...all]
}

export function ProfileForm({ user }: { user: User }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const queryClient = useQueryClient()
  const zones = useMemo(() => timezones(user.timezone), [user.timezone])

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('info.nameRequired')).max(255),
        timezone: z.string().min(1),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name, timezone: user.timezone },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await updateProfile(values)
      queryClient.setQueryData(currentUserKey, updated)
      toast.success(t('info.saved'))
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('info.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="name" label={t('info.name')} error={errors.name?.message}>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
          </FormField>
          <FormField id="email" label={t('info.email')} hint={t('info.emailHint')}>
            <Input id="email" value={user.email} disabled readOnly />
          </FormField>
          <FormField
            id="timezone"
            label={t('info.timezone')}
            error={errors.timezone?.message}
            hint={t('info.timezoneHint')}
          >
            <NativeSelect id="timezone" {...register('timezone')}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? tc('states.saving') : tc('actions.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
