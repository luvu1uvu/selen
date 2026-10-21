import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { CardDetail } from '@/shared/types/api'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu'
import { cardLink, type AddKind } from '../cardWindow'
import { useDeleteCard, useSetCardArchived } from '../queries'

/**
 * Ряд действий окна карточки (README Kaiten, раздел 02): линия во всю ширину, на левом конце — круглая «+» (добавить
 * в карточку), на правом — «⋯» (действия с карточкой). Кнопки этапов 7 и 10 («→ Следующая колонка», «!», «поделиться»,
 * ⚡) встанут справа перед «⋯». Пункты — только разрешённые: нет ни одного — нет и кнопки.
 */
export function CardActionsRow({
  card,
  canEdit,
  canAttach,
  onAdd,
  onPickFiles,
  onMove,
  onDeleted,
}: {
  card: CardDetail
  canEdit: boolean
  canAttach: boolean
  onAdd: (kind: AddKind) => void
  onPickFiles: () => void
  onMove: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const setArchived = useSetCardArchived(card.key)
  const remove = useDeleteCard()
  const [deleting, setDeleting] = useState(false)

  const toggleArchived = async () => {
    const archived = !card.archived_at
    try {
      await setArchived.mutateAsync(archived)
      toast.success(archived ? t('card.archivedToast') : t('card.restoredToast'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const copyLink = async () => {
    await navigator.clipboard?.writeText(cardLink(card.key))
    toast.success(t('card.linkCopied'))
  }

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(card.key)
      toast.success(t('card.deletedToast'))
      onDeleted()
    } catch (error) {
      setDeleting(false)
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <div className="relative flex items-center">
      <div aria-hidden className="bg-border absolute inset-x-0 top-1/2 h-px" />
      {(canEdit || canAttach) && (
        <ActionsMenu
          label={t('card.add')}
          align="start"
          icon={<Plus />}
          className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground relative rounded-full shadow-md"
        >
          {(opensDialog) => (
            <>
              {canEdit && (
                <DropdownMenuItem onSelect={opensDialog(() => onAdd('checklist'))}>
                  {t('card.addChecklist')}
                </DropdownMenuItem>
              )}
              {canAttach && (
                <DropdownMenuItem onSelect={onPickFiles}>{t('card.addFile')}</DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuItem onSelect={opensDialog(() => onAdd('link'))}>
                    {t('card.addLink')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={opensDialog(() => onAdd('parent'))}>
                    {t('card.addParent')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={opensDialog(() => onAdd('child'))}>
                    {t('card.addChild')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={opensDialog(() => onAdd('block'))}>
                    {t('card.addBlock')}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </ActionsMenu>
      )}
      <div className="relative ml-auto flex items-center gap-2">
        <ActionsMenu
          label={t('card.actions', { title: card.title })}
          className="bg-background rounded-full border shadow-xs"
        >
          {(opensDialog) => (
            <>
              {canEdit && (
                <DropdownMenuItem onSelect={opensDialog(onMove)}>{t('card.move')}</DropdownMenuItem>
              )}
              {card.permissions.edit && (
                <DropdownMenuItem disabled={setArchived.isPending} onSelect={toggleArchived}>
                  {card.archived_at ? t('card.restoreFromArchive') : t('card.archive')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={copyLink}>{t('card.copyLink')}</DropdownMenuItem>
              {card.permissions.delete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={opensDialog(() => setDeleting(true))}
                  >
                    {t('card.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </ActionsMenu>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('card.deleteTitle', { key: card.key })}
        description={t('card.deleteDescription', { title: card.title })}
        confirmLabel={t('card.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
