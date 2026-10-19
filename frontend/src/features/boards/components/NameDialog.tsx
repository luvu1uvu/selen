import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

/** Диалог с одним полем «Название»: переименование и создание дорожек, колонок, доски. */
export function NameDialog({
  open,
  title,
  description,
  initialName = '',
  submitLabel,
  pending = false,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  initialName?: string
  submitLabel?: string
  pending?: boolean
  onSubmit: (name: string) => void
  onClose: () => void
  children?: React.ReactNode
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [name, setName] = useState(initialName)
  // При каждом открытии начинаем с исходного названия
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setName(initialName)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onSubmit(name.trim())
          }}
        >
          <FormField id="structure-name" label={t('rename.name')}>
            <Input
              id="structure-name"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {submitLabel ?? tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
