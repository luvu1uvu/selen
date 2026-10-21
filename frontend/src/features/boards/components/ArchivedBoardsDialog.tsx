import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { Space } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { setBoardArchived } from '../api'
import { useSpaceBoards, useStructureMutation } from '../queries'

/**
 * «Архив досок» на панели пространства (вместо списка под досками): архивные доски открываются отдельной страницей
 * (только для чтения), администратор пространства восстанавливает их — доска встаёт на прежнее место в раскладке.
 * Открывает его панель — кнопкой или, на узком экране, пунктом меню «⋯» (LATER-74, дополнение PM 21.10).
 */
export function ArchivedBoardsDialog({
  space,
  open,
  onOpenChange,
}: {
  space: Space
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const boardsQuery = useSpaceBoards(space.key)
  const archived = (boardsQuery.data ?? []).filter((board) => board.archived_at)
  const restore = useStructureMutation((boardId: string) => setBoardArchived(boardId, false))

  const onRestore = async (boardId: string) => {
    try {
      await restore.mutateAsync(boardId)
      toast.success(t('list.restoredToast'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('layout.archived')}</DialogTitle>
          <DialogDescription>{t('layout.archivedHint')}</DialogDescription>
        </DialogHeader>
        {archived.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('layout.archivedEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {archived.map((board) => (
              <li
                key={board.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <Link
                  to={`/boards/${board.id}`}
                  className="min-w-0 truncate text-sm hover:underline"
                >
                  {board.name}
                </Link>
                {space.permissions.manage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => onRestore(board.id)}
                  >
                    {t('list.restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
