import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { useCurrentUser } from '@/features/auth/queries'
import { setCardArchived } from '@/features/cards/api'
import { useArchivedCards, useCardChanged, useDeleteCard } from '@/features/cards/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { useMutation } from '@tanstack/react-query'

/**
 * Архивные карточки доски (editor и admin): поиск по номеру или названию, восстановление.
 * Системный администратор может удалить карточку в корзину (ADR-0015).
 * Сервер отдаёт только видимые пользователю карточки (режим «только свои карточки»).
 */
export function ArchivedCardsDialog({
  boardId,
  canDelete,
  onClose,
}: {
  boardId: string
  /** Удалять в корзину — системный администратор, доска и пространство не в архиве (с сервера). */
  canDelete: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebouncedValue(query.trim())
  const archived = useArchivedCards(boardId, search, page)
  const changed = useCardChanged()
  const restore = useMutation({
    mutationFn: (key: string) => setCardArchived(key, false),
    onSuccess: changed,
  })
  const remove = useDeleteCard()
  // Цель подтверждения остаётся, пока окно закрывается с анимацией, — без мелькания пустого названия
  const [deleting, setDeleting] = useState<{ key: string; title: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const confirmDelete = (key: string) =>
    remove
      .mutateAsync(key)
      .then(() => toast.success(t('card.deletedToast')))
      .catch((error) => toast.error(getErrorMessage(error, tc('errors.generic'))))
      .finally(() => setConfirmOpen(false))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('archive.title')}</DialogTitle>
          <DialogDescription>{t('archive.description')}</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          aria-label={t('archive.search')}
          placeholder={t('archive.search')}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />
        {archived.data?.data.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {search ? t('archive.nothingFound') : t('archive.empty')}
          </p>
        )}
        <ul className="grid max-h-[60vh] gap-1 overflow-y-auto">
          {archived.data?.data.map((card) => (
            <li
              key={card.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <div className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  <Link
                    to={`/cards/${card.key}`}
                    className="shrink-0 font-mono text-xs hover:underline"
                    onClick={onClose}
                  >
                    {card.key}
                  </Link>
                  <span className="truncate" title={card.title}>
                    {card.title}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('archive.archivedAt', {
                    column: card.column.name,
                    date: formatDateTime(card.archived_at, me?.timezone),
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={restore.isPending}
                onClick={() =>
                  restore
                    .mutateAsync(card.key)
                    .then(() => toast.success(t('card.restoredToast')))
                    .catch((error) => toast.error(getErrorMessage(error, tc('errors.generic'))))
                }
              >
                {t('card.restore')}
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-8"
                  aria-label={t('card.deleteLabel', { key: card.key })}
                  title={t('card.deleteLabel', { key: card.key })}
                  onClick={() => {
                    setDeleting({ key: card.key, title: card.title })
                    setConfirmOpen(true)
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {archived.data && <Pagination meta={archived.data.meta} onPageChange={setPage} />}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('card.deleteTitle', { key: deleting?.key ?? '' })}
          description={t('card.deleteDescription', { title: deleting?.title ?? '' })}
          confirmLabel={t('card.deleteConfirm')}
          pending={remove.isPending}
          onConfirm={() => deleting && confirmDelete(deleting.key)}
        />
      </DialogContent>
    </Dialog>
  )
}
