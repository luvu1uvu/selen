import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { cn } from '@/shared/lib/utils'
import type { BoardTemplate } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { useCreateBoard } from '../queries'

const TEMPLATES: BoardTemplate[] = ['development', 'simple', 'empty']

export function CreateBoardDialog({
  spaceKey,
  open: controlledOpen,
  onOpenChange,
}: {
  spaceKey: string
  /** Открытие снаружи (из меню дерева) — без своей кнопки. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const [template, setTemplate] = useState<BoardTemplate>('development')
  const createBoard = useCreateBoard(spaceKey)

  // Описание (LATER-64) — необязательное, до 2000 символов, как на сервере; показывается за значком ⓘ в шапке доски
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('create.nameRequired')).max(100),
        description: z.string().trim().max(2000, t('create.descriptionTooLong')),
      }),
    [t],
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
    defaultValues: { name: '', description: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const board = await createBoard.mutateAsync({
        name: values.name,
        description: values.description || null,
        template,
      })
      toast.success(t('create.created'))
      setOpen(false)
      reset()
      navigate(`/boards/${board.id}`)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button>{t('list.create')}</Button>
        </DialogTrigger>
      )}
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="board-name" label={t('create.name')} error={errors.name?.message}>
            <Input id="board-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField
            id="board-description"
            label={t('create.description')}
            hint={t('create.descriptionHint')}
            error={errors.description?.message}
          >
            <Textarea
              id="board-description"
              rows={3}
              aria-invalid={!!errors.description}
              {...register('description')}
            />
          </FormField>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('create.template')}</legend>
            {TEMPLATES.map((value) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md border p-3 text-sm',
                  template === value && 'border-primary',
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={value}
                  checked={template === value}
                  onChange={() => setTemplate(value)}
                />
                <span>
                  <span className="font-medium">{t(`templates.${value}`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`templateHints.${value}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t('create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
