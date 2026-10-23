import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

/**
 * Браузер не дал скопировать ссылку (страница не на https и не на localhost, доступ к буферу запрещён): окно с
 * выделенной ссылкой — скопировать её вручную (U-6 UX-ревью UI-1b). Открыто, пока `url` не null.
 */
export function ManualCopyDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('manualCopy.title')}</DialogTitle>
          <DialogDescription>{t('manualCopy.hint')}</DialogDescription>
        </DialogHeader>
        <Input
          readOnly
          autoFocus
          aria-label={t('manualCopy.field')}
          value={url ?? ''}
          onFocus={(event) => event.currentTarget.select()}
        />
      </DialogContent>
    </Dialog>
  )
}
