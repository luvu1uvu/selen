import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
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
import { isSingleEmoji } from '../emoji'
import { EmojiField } from './EmojiField'
import { useCreateFolder, useUpdateNavNode } from '../queries'

/**
 * Что редактируем: новая папка (в корне или в папке parent), папка (название и иконка) или только
 * иконка узла (у пространства — всегда: название меняется в настройках пространства).
 */
export type FolderDialogTarget =
  | { mode: 'create'; parent: { id: string; name: string } | null }
  | { mode: 'folder'; id: string; name: string; icon: string | null }
  | { mode: 'icon'; id: string; name: string; icon: string | null }

export function FolderDialog({
  target,
  onClose,
}: {
  target: FolderDialogTarget | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const createFolder = useCreateFolder()
  const updateNode = useUpdateNavNode()
  const withName = target?.mode !== 'icon'

  const schema = useMemo(
    () =>
      z.object({
        name: withName
          ? z.string().trim().min(1, t('structure.folder.nameRequired')).max(100)
          : z.string(),
        icon: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || isSingleEmoji(value),
            t('structure.folder.iconInvalid'),
          ),
      }),
    [t, withName],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', icon: '' } })

  useEffect(() => {
    if (target) {
      reset({
        name: target.mode === 'folder' ? target.name : '',
        icon: target.mode === 'create' ? '' : (target.icon ?? ''),
      })
    }
  }, [target, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!target) return
    const icon = values.icon.trim() || null
    try {
      if (target.mode === 'create') {
        await createFolder.mutateAsync({
          name: values.name,
          icon,
          parent_id: target.parent?.id ?? null,
        })
        toast.success(t('structure.toasts.created'))
      } else {
        await updateNode.mutateAsync(
          target.mode === 'folder'
            ? { id: target.id, name: values.name, icon }
            : { id: target.id, icon },
        )
        toast.success(t('structure.toasts.saved'))
      }
      onClose()
    } catch (error) {
      // Ошибки полей формы — под полями; прочие (родитель, архив) — сообщением
      const fields = Object.keys(getErrorBody(error)?.errors ?? {})
      const ownFields =
        fields.length > 0 && fields.every((field) => field === 'name' || field === 'icon')
      if (!ownFields || !applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  const title =
    target?.mode === 'create'
      ? t('structure.folder.createTitle')
      : target?.mode === 'folder'
        ? t('structure.folder.editTitle', { name: target.name })
        : t('structure.folder.iconTitle', { name: target?.name ?? '' })

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {target?.mode === 'create' && (
            <DialogDescription>
              {target.parent
                ? t('structure.folder.createIn', { name: target.parent.name })
                : t('structure.folder.createInRoot')}
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {withName && (
            <FormField
              id="folder-name"
              label={t('structure.folder.name')}
              error={errors.name?.message}
            >
              <Input id="folder-name" aria-invalid={!!errors.name} {...register('name')} />
            </FormField>
          )}
          <FormField
            id="folder-icon"
            label={t('structure.folder.icon')}
            hint={t('structure.folder.iconHint')}
            error={errors.icon?.message}
          >
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <EmojiField
                  id="folder-icon"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.icon}
                />
              )}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {target?.mode === 'create'
                ? t('structure.folder.submitCreate')
                : t('structure.folder.submitSave')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
