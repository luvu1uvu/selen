import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { LabelBadge } from '@/shared/components/LabelBadge'
import type { Label } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useSetLabelArchived } from '../queries'

/** Таблица меток одного набора; меню действий — только тем, кто им управляет. */
export function LabelsTable({
  labels,
  canManage,
  onEdit,
}: {
  labels: Label[]
  canManage: boolean
  onEdit: (label: Label) => void
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const setArchived = useSetLabelArchived()

  const toggleArchived = async (label: Label) => {
    const archived = !label.archived_at
    try {
      await setArchived.mutateAsync({ id: label.id, archived })
      toast.success(archived ? t('labels.toasts.archived') : t('labels.toasts.restored'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  if (labels.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('labels.empty')}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('labels.columns.name')}</TableHead>
          <TableHead>{t('labels.columns.status')}</TableHead>
          {canManage && (
            <TableHead className="w-12">
              <span className="sr-only">{t('labels.columns.actions')}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {labels.map((label) => (
          <TableRow key={label.id}>
            <TableCell>
              <LabelBadge name={label.name} color={label.color} />
            </TableCell>
            <TableCell>
              {label.archived_at && <Badge variant="warning">{t('labels.archivedBadge')}</Badge>}
            </TableCell>
            {canManage && (
              <TableCell>
                <ActionsMenu label={t('labels.actions.menu', { name: label.name })}>
                  {(dialog) => (
                    <>
                      <DropdownMenuItem onSelect={dialog(() => onEdit(label))}>
                        {t('labels.actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => toggleArchived(label)}>
                        {label.archived_at
                          ? t('labels.actions.restore')
                          : t('labels.actions.archive')}
                      </DropdownMenuItem>
                    </>
                  )}
                </ActionsMenu>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
