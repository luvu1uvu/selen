import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminNavNode } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'

/**
 * Восстановление папки, в которой лежат архивные пространства: галочка «восстановить также пространства»
 * (по умолчанию выключена) — иначе восстановленная папка выглядит пустой.
 */
export function RestoreFolderDialog({
  folder,
  spaces,
  pending,
  onConfirm,
  onClose,
}: {
  folder: AdminNavNode | null
  /** Архивные пространства прямо в папке. */
  spaces: AdminNavNode[]
  pending: boolean
  onConfirm: (restoreSpaces: boolean) => void
  onClose: () => void
}) {
  // Новая папка — новая форма с выключенной галочкой
  return folder ? (
    <RestoreFolderForm
      key={folder.id}
      folder={folder}
      spaces={spaces}
      pending={pending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  ) : null
}

function RestoreFolderForm({
  folder,
  spaces,
  pending,
  onConfirm,
  onClose,
}: {
  folder: AdminNavNode
  spaces: AdminNavNode[]
  pending: boolean
  onConfirm: (restoreSpaces: boolean) => void
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const [withSpaces, setWithSpaces] = useState(false)
  const names = spaces.map((node) => node.space?.name ?? '').join(', ')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('structure.restore.title', { name: folder.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('structure.restore.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox
            id="restore-spaces"
            className="mt-0.5"
            checked={withSpaces}
            onCheckedChange={(checked) => setWithSpaces(checked === true)}
          />
          <div className="grid gap-1">
            <Label htmlFor="restore-spaces">
              {t('structure.restore.withSpaces', { count: spaces.length })}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t('structure.restore.withSpacesHint', { names })}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => onConfirm(withSpaces)}>
            {t('structure.restore.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
