import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LayoutGrid, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { BoardSummary, Space } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { moveBoard, setBoardArchived } from '../api'
import { useSpaceBoards, useStructureMutation } from '../queries'
import { CreateBoardDialog } from './CreateBoardDialog'

/** Доски на странице пространства: список, создание из шаблона, порядок и архив (для админа). */
export function SpaceBoards({ space }: { space: Space }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const boardsQuery = useSpaceBoards(space.key)
  const mutation = useStructureMutation((fn: () => Promise<void>) => fn())
  const [toArchive, setToArchive] = useState<BoardSummary | null>(null)
  const canManage = space.permissions.manage

  const boards = boardsQuery.data ?? []
  const active = boards.filter((b) => !b.archived_at)
  const archived = boards.filter((b) => b.archived_at)

  const run = async (fn: () => Promise<void>, success?: string) => {
    try {
      await mutation.mutateAsync(fn)
      if (success) toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <div className="grid gap-4">
      {canManage && (
        <div className="flex justify-end">
          <CreateBoardDialog spaceKey={space.key} />
        </div>
      )}
      {boardsQuery.isSuccess && active.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <LayoutGrid className="size-8" />
          <p>{t('list.empty')}</p>
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((board, index) => (
          <li
            key={board.id}
            className="flex items-center justify-between gap-2 rounded-xl border p-4"
          >
            <Link
              to={`/boards/${board.id}`}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {board.name}
            </Link>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('list.menu', { name: board.name })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={index === 0}
                    onSelect={() =>
                      run(() => moveBoard(board.id, { before_id: active[index - 1]?.id }))
                    }
                  >
                    {t('list.moveUp')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === active.length - 1}
                    onSelect={() =>
                      run(() => moveBoard(board.id, { after_id: active[index + 1]?.id }))
                    }
                  >
                    {t('list.moveDown')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setToArchive(board)}>
                    {t('list.archive')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details className="grid gap-2">
          <summary className="text-muted-foreground cursor-pointer text-sm">
            {t('list.archived')} ({archived.length})
          </summary>
          <ul className="mt-2 grid gap-2">
            {archived.map((board) => (
              <li
                key={board.id}
                className="flex items-center justify-between gap-2 rounded-md border px-4 py-2"
              >
                <Link
                  to={`/boards/${board.id}`}
                  className="text-muted-foreground truncate hover:underline"
                >
                  {board.name}
                </Link>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run(() => setBoardArchived(board.id, false), t('list.restoredToast'))
                    }
                  >
                    {t('list.restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        pending={mutation.isPending}
        title={t('list.confirmArchiveTitle')}
        description={t('list.confirmArchiveText', { name: toArchive?.name ?? '' })}
        confirmLabel={t('list.archive')}
        onConfirm={async () => {
          if (toArchive)
            await run(() => setBoardArchived(toArchive.id, true), t('list.archivedToast'))
          setToArchive(null)
        }}
      />
    </div>
  )
}
