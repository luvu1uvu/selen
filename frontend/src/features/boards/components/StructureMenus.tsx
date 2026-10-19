import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { cn } from '@/shared/lib/utils'
import type { BoardColumn, Lane } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { moveColumn, moveLane } from '../api'
import { useStructureMutation } from '../queries'
import type { StructureAction } from './StructureDialogs'

const CATEGORY_STYLES = {
  queue: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-emerald-100 text-emerald-800',
} as const

/** Перестановка через меню: надёжнее перетаскивания на сетке с подколонками и доступно с клавиатуры. */
function useMove(fn: (id: string, n: { after_id?: string; before_id?: string }) => Promise<void>) {
  const { t: tc } = useTranslation()
  const mutation = useStructureMutation(
    (v: { id: string; after_id?: string; before_id?: string }) =>
      fn(v.id, { after_id: v.after_id, before_id: v.before_id }),
  )
  return (variables: { id: string; after_id?: string; before_id?: string }) =>
    mutation.mutate(variables, {
      onError: (error) => toast.error(getErrorMessage(error, tc('errors.generic'))),
    })
}

/**
 * Заголовок колонки или подколонки: название, тип, счётчик карточек, «+» (новая карточка в начало колонки —
 * у листовых колонок, если можно создавать карточки, LATER-44) и меню администратора.
 */
export function ColumnHeader({
  column,
  siblings,
  count,
  isTopLevel,
  canManage,
  onAction,
  onAddCard,
}: {
  column: BoardColumn
  siblings: BoardColumn[]
  count: number
  isTopLevel: boolean
  canManage: boolean
  onAction: (action: StructureAction) => void
  onAddCard?: () => void
}) {
  const { t } = useTranslation('boards')
  const move = useMove(moveColumn)
  const index = siblings.findIndex((c) => c.id === column.id)
  const previous = siblings[index - 1]
  const next = siblings[index + 1]

  return (
    // Без своей плашки: колонки разделены тонкими линиями (как в Kaiten); отступ слева — как у карточек в ячейке
    <div className="flex min-h-9 items-center justify-between gap-2 px-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('truncate text-sm', isTopLevel ? 'font-semibold' : 'font-medium')}>
          {column.name}
        </span>
        <span
          className="text-muted-foreground text-xs tabular-nums"
          title={t('board.cardsCount', { count })}
        >
          {count}
        </span>
        {isTopLevel && (
          <Badge className={cn('border-transparent', CATEGORY_STYLES[column.category])}>
            {t(`categories.${column.category}`)}
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {onAddCard && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('addCard.topLabel', { column: column.name })}
            title={t('addCard.topLabel', { column: column.name })}
            onClick={onAddCard}
          >
            <Plus />
          </Button>
        )}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('column.menu', { name: column.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onAction({ kind: 'renameColumn', column })}>
                {t('column.rename')}
              </DropdownMenuItem>
              {isTopLevel && (
                <>
                  <DropdownMenuItem
                    onSelect={() => onAction({ kind: 'addSubcolumn', parent: column })}
                  >
                    {t('column.addSubcolumn')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onAction({ kind: 'changeType', column, cardsCount: count })}
                  >
                    {t('column.changeType')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                disabled={!previous}
                onSelect={() => previous && move({ id: column.id, before_id: previous.id })}
              >
                {t('column.moveLeft')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!next}
                onSelect={() => next && move({ id: column.id, after_id: next.id })}
              >
                {t('column.moveRight')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onAction({ kind: 'archiveColumn', column })}
              >
                {t('column.archive')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/** Меню администратора у названия дорожки: переименовать, переставить, архивировать. */
export function LaneMenu({
  lane,
  lanes,
  onAction,
}: {
  lane: Lane
  lanes: Lane[]
  onAction: (action: StructureAction) => void
}) {
  const { t } = useTranslation('boards')
  const move = useMove(moveLane)
  const index = lanes.findIndex((l) => l.id === lane.id)
  const previous = lanes[index - 1]
  const next = lanes[index + 1]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t('lane.menu', { name: lane.name })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onAction({ kind: 'renameLane', lane })}>
          {t('lane.rename')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!previous}
          onSelect={() => previous && move({ id: lane.id, before_id: previous.id })}
        >
          {t('lane.moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!next}
          onSelect={() => next && move({ id: lane.id, after_id: next.id })}
        >
          {t('lane.moveDown')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onAction({ kind: 'archiveLane', lane })}
        >
          {t('lane.archive')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
