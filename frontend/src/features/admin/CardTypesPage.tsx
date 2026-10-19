import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { CardTypeLabel } from '@/shared/components/CardTypeLabel'
import type { CardType } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { CardTypeDialog } from './components/CardTypeDialog'
import { useAdminCardTypes, useSetCardTypeArchived } from './queries'

/** Справочник типов карточек (системный администратор). */
export function CardTypesPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const typesQuery = useAdminCardTypes()
  const setArchived = useSetCardTypeArchived()
  const [editing, setEditing] = useState<CardType | 'new' | null>(null)

  const toggleArchived = async (type: CardType) => {
    const archived = !type.archived_at
    try {
      await setArchived.mutateAsync({ id: type.id, archived })
      toast.success(archived ? t('cardTypes.toasts.archived') : t('cardTypes.toasts.restored'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('cardTypes.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('cardTypes.description')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('cardTypes.create')}</Button>
      </div>

      {typesQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('cardTypes.columns.name')}</TableHead>
            <TableHead>{t('cardTypes.columns.status')}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t('cardTypes.columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {typesQuery.data?.map((type) => (
            <TableRow key={type.id}>
              <TableCell>
                <CardTypeLabel name={type.name} color={type.color} />
              </TableCell>
              <TableCell className="space-x-2">
                {type.is_default && (
                  <Badge variant="secondary">{t('cardTypes.defaultBadge')}</Badge>
                )}
                {type.archived_at && (
                  <Badge variant="warning">{t('cardTypes.archivedBadge')}</Badge>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('cardTypes.actions.menu')}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(type)}>
                      {t('cardTypes.actions.edit')}
                    </DropdownMenuItem>
                    {!type.is_default && (
                      <DropdownMenuItem onSelect={() => toggleArchived(type)}>
                        {type.archived_at
                          ? t('cardTypes.actions.restore')
                          : t('cardTypes.actions.archive')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CardTypeDialog type={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
