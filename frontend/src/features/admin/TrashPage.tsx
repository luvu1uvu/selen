import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useRestoreFromTrash, useTrash } from './queries'

/**
 * «Администрирование → Корзина» (ADR-0015): карточки, удалённые системным администратором, — номер, название,
 * пространство и доска, кто и когда удалил. «Восстановить» возвращает карточку туда, откуда её удалили.
 * Название из пространства, к которому у администратора нет доступа, сервер не отдаёт — показываем пометку.
 * Физической очистки нет.
 */
export function TrashPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [page, setPage] = useState(1)
  const trash = useTrash(page)
  const restore = useRestoreFromTrash()

  const onRestore = (key: string) =>
    restore
      .mutateAsync(key)
      .then(() => toast.success(t('trash.restored', { key })))
      .catch((error) => toast.error(getErrorMessage(error, tc('errors.generic'))))

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('trash.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('trash.description')}</p>
      </div>

      {trash.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('trash.columns.card')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('trash.columns.space')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('trash.columns.deleted')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {trash.data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                {t('trash.empty')}
              </TableCell>
            </TableRow>
          )}
          {trash.data?.data.map((card) => (
            <TableRow key={card.id}>
              <TableCell className="max-w-xs">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-xs tabular-nums">{card.key}</span>
                  {card.title_hidden ? (
                    <span className="text-muted-foreground italic">{t('trash.titleHidden')}</span>
                  ) : (
                    <span className="truncate" title={card.title ?? undefined}>
                      {card.title}
                    </span>
                  )}
                </div>
                {card.archived && (
                  <Badge variant="secondary" className="mt-1">
                    {t('trash.fromArchive')}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Link to={`/spaces/${card.space.key}`} className="hover:underline">
                  {card.space.name}
                </Link>
                <div className="text-muted-foreground text-xs">{card.board.name}</div>
              </TableCell>
              <TableCell className="hidden text-sm sm:table-cell">
                {card.deleted_by?.name}
                {card.deleted_at && (
                  <div className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDateTime(card.deleted_at, me?.timezone)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restore.isPending}
                  aria-label={t('trash.restoreLabel', { key: card.key })}
                  onClick={() => onRestore(card.key)}
                >
                  {t('trash.restore')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {trash.data && <Pagination meta={trash.data.meta} onPageChange={setPage} />}
    </div>
  )
}
