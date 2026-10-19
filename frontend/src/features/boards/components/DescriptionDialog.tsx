import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Textarea } from '@/shared/ui/textarea'

/** Сервер не примет длиннее (UpdateBoardRequest) — то же ограничение, что в окне «Новая доска». */
const MAX_LENGTH = 2000

/**
 * Описание доски (LATER-64): изменить или стереть — то же поле, что при создании. Пустое поле — описания нет,
 * значок ⓘ в шапке доски пропадает.
 */
export function DescriptionDialog({
  open,
  initialDescription,
  pending = false,
  onSubmit,
  onClose,
}: {
  open: boolean
  initialDescription: string | null
  pending?: boolean
  onSubmit: (description: string | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [description, setDescription] = useState(initialDescription ?? '')
  // При каждом открытии начинаем с текущего описания
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDescription(initialDescription ?? '')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('board.descriptionTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(description.trim() || null)
          }}
        >
          <FormField
            id="board-description-edit"
            label={t('create.description')}
            hint={t('board.descriptionEditHint')}
          >
            <Textarea
              id="board-description-edit"
              autoFocus
              rows={4}
              maxLength={MAX_LENGTH}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
