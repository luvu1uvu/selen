import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { EmojiField } from '@/features/navigation/components/EmojiField'
import { isSingleEmoji } from '@/features/navigation/emoji'
import { useAdminCompanyId } from '@/features/admin/company'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
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
  DialogTrigger,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { useCreateSpace } from '../queries'

const SPACE_KEY_PATTERN = /^[A-Z]{2,10}$/

/**
 * Новое пространство. Без open/onOpenChange — со своей кнопкой (админка «Пространства»),
 * с ними — управляется снаружи («+» в панели «Дерево»).
 */
const FORM_FIELDS = ['name', 'key', 'description', 'icon']

export function CreateSpaceDialog({
  open: controlledOpen,
  onOpenChange,
  parent = null,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Папка дерева, в которой создать пространство (по умолчанию — корень). */
  parent?: { id: string; name: string } | null
} = {}) {
  const company = useAdminCompanyId()
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const [admins, setAdmins] = useState<DirectoryUser[]>([])
  const createSpace = useCreateSpace()

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('spaces.form.nameRequired')).max(100),
        key: z.string().trim().regex(SPACE_KEY_PATTERN, t('spaces.form.keyInvalid')),
        description: z.string().max(2000),
        icon: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || isSingleEmoji(value),
            t('structure.folder.iconInvalid'),
          ),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', key: '', description: '', icon: '' },
  })

  const close = () => {
    setOpen(false)
    reset()
    setAdmins([])
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createSpace.mutateAsync({
        name: values.name,
        key: values.key,
        description: values.description.trim() || null,
        icon: values.icon.trim() || null,
        // Никого не выбрали — администратором станет сам системный администратор (решает API)
        ...(admins.length > 0 ? { admin_ids: admins.map((admin) => admin.id) } : {}),
        ...(parent ? { parent_id: parent.id } : {}),
      })
      toast.success(t('spaces.toasts.created'))
      close()
    } catch (error) {
      // Ошибки полей формы — под полями; прочие (администраторы, папка) — сообщением, а не молча
      const fields = Object.keys(getErrorBody(error)?.errors ?? {})
      const ownFields = fields.length > 0 && fields.every((field) => FORM_FIELDS.includes(field))
      if (!ownFields || !applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  const keyField = register('key', {
    setValueAs: (value: string) => value.toUpperCase(),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button>{t('spaces.create')}</Button>
        </DialogTrigger>
      )}
      <DialogContent
        closeLabel={tc('actions.close')}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('spaces.form.title')}</DialogTitle>
          <DialogDescription>
            {t('spaces.form.description')}
            {parent && (
              <span className="mt-1 block">{t('spaces.form.inFolder', { name: parent.name })}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="space-name" label={t('spaces.form.name')} error={errors.name?.message}>
            <Input id="space-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField
            id="space-key"
            label={t('spaces.form.key')}
            hint={t('spaces.form.keyHint')}
            error={errors.key?.message}
          >
            <Input
              id="space-key"
              className="font-mono uppercase"
              maxLength={10}
              autoComplete="off"
              aria-invalid={!!errors.key}
              {...keyField}
            />
          </FormField>
          <FormField
            id="space-icon"
            label={t('spaces.form.icon')}
            hint={t('spaces.form.iconHint')}
            error={errors.icon?.message}
          >
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <EmojiField
                  id="space-icon"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.icon}
                />
              )}
            />
          </FormField>
          <FormField
            id="space-description"
            label={t('spaces.form.spaceDescription')}
            error={errors.description?.message}
          >
            <Textarea id="space-description" rows={2} {...register('description')} />
          </FormField>
          <FormField
            id="space-admins"
            label={t('spaces.form.admins')}
            hint={t('spaces.form.adminsHint')}
          >
            <div className="grid gap-2">
              {admins.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {admins.map((admin) => (
                    <Badge key={admin.id} variant="secondary" className="gap-1 pr-1">
                      {admin.name}
                      <button
                        type="button"
                        aria-label={t('spaces.form.removeAdmin', { name: admin.name })}
                        onClick={() => setAdmins(admins.filter((a) => a.id !== admin.id))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <UserPicker
                companyId={company}
                id="space-admins"
                value={null}
                excludeIds={admins.map((admin) => admin.id)}
                onChange={(user) => user && setAdmins([...admins, user])}
              />
            </div>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t('spaces.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
