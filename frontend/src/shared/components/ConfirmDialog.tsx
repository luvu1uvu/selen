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

/** Диалог подтверждения необратимого или чувствительного действия. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  /** Подпись отказа, если «Отмена» не подходит по смыслу. */
  cancelLabel?: string
  pending?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  /** Куда вернуть фокус после закрытия (по умолчанию — туда, где он был до открытия). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('actions.close')} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
