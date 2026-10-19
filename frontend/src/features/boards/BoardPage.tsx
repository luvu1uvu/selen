import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { CardPanel } from '@/features/cards/components/CardPanel'
import { useCard } from '@/features/cards/queries'
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { NotFoundState } from '@/shared/components/NotFoundState'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ArchivedCardsDialog } from './components/ArchivedCardsDialog'
import { BoardView } from './components/BoardView'
import { StructureDialogs, type StructureAction } from './components/StructureDialogs'
import { useBoard, useSetAutoAssign } from './queries'

/**
 * Доска (/boards/:boardId) и та же доска с открытой карточкой (/cards/:cardKey).
 * Чужая или несуществующая доска/карточка — «не найдено».
 */
export function BoardPage() {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { boardId: boardParam, cardKey } = useParams()
  const navigate = useNavigate()
  const cardQuery = useCard(cardKey)
  const boardId = boardParam ?? cardQuery.data?.board.id
  const boardQuery = useBoard(boardId)
  const [action, setAction] = useState<StructureAction>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const setAutoAssign = useSetAutoAssign(boardId ?? '')

  if (cardKey && cardQuery.isError) {
    return getErrorStatus(cardQuery.error) === 404 ? (
      <NotFoundState title={t('card.notFound')} text={t('card.notFoundText')} />
    ) : (
      <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
    )
  }

  if (boardQuery.isError) {
    return getErrorStatus(boardQuery.error) === 404 ? (
      <NotFoundState title={t('board.notFound')} text={t('board.notFoundText')} />
    ) : (
      <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
    )
  }

  if (!boardQuery.data) {
    return <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
  }

  const board = boardQuery.data

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/spaces/${board.space.key}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            {board.space.name}
          </Link>
          <h1 className="truncate text-2xl font-semibold">{board.name}</h1>
          {/* Описание доски (например, шаблон бага на «Багах приёмки» стенда PM) — с переносами строк */}
          {board.description && (
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm whitespace-pre-line">
              {board.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {board.permissions.edit_cards && (
            <Button variant="outline" onClick={() => setArchiveOpen(true)}>
              <Archive />
              {t('archive.open')}
            </Button>
          )}
          {board.permissions.manage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('board.menu')}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAction({ kind: 'addColumn' })}>
                  {t('board.addColumn')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAction({ kind: 'addLane' })}>
                  {t('board.addLane')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setAction({ kind: 'renameBoard', name: board.name })}
                >
                  {t('board.rename')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={board.auto_assign_on_move}
                  title={t('board.autoAssignHint')}
                  onCheckedChange={async (checked) => {
                    try {
                      await setAutoAssign.mutateAsync(checked)
                      toast.success(checked ? t('board.autoAssignOn') : t('board.autoAssignOff'))
                    } catch (error) {
                      toast.error(getErrorMessage(error, tc('errors.generic')))
                    }
                  }}
                >
                  {t('board.autoAssign')}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {board.archived_at && <Alert>{t('board.archived')}</Alert>}
      {!board.has_done_column && <Alert>{t('board.noDoneColumn')}</Alert>}

      {board.columns.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-12 text-center">
          {t('board.noColumns')}
        </div>
      ) : (
        // Сбой доски не уносит шапку страницы и остальное приложение
        <ErrorBoundary>
          <BoardView
            board={board}
            onOpenCard={(key) => navigate(`/cards/${key}`)}
            onAction={setAction}
          />
        </ErrorBoundary>
      )}

      <StructureDialogs boardId={board.id} action={action} onClose={() => setAction(null)} />
      {archiveOpen && (
        <ArchivedCardsDialog
          boardId={board.id}
          canDelete={board.permissions.delete_cards}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {cardKey && <CardPanel cardKey={cardKey} onClose={() => navigate(`/boards/${board.id}`)} />}
    </div>
  )
}
