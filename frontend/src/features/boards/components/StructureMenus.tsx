import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { TruncatedText } from '@/shared/components/TruncatedText'
import { cn } from '@/shared/lib/utils'
import type { BoardColumn, Lane } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { moveColumn, moveLane } from '../api'
import { useStructureMutation } from '../queries'
import type { StructureAction } from './StructureDialogs'

/** Точка категории колонки: токены category-* — не меньше 3:1 к белому (правила вида, разделы 2 и 11). */
const CATEGORY_DOTS = {
  queue: 'bg-category-queue',
  in_progress: 'bg-category-progress',
  done: 'bg-category-done',
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
 * Заголовок колонки или подколонки, как в Kaiten (README Kaiten, раздел 03; LATER-77): название слева на всю оставшуюся
 * ширину, справа — категория точкой с подсказкой (у колонки верхнего уровня), счётчик карточек, «+» (новая карточка
 * в начало колонки — у листовых колонок, если можно создавать карточки, LATER-44) и меню администратора.
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
    <div className="flex min-h-9 items-center gap-2 px-2">
      {/* Обрезанное название — полное в подсказке (LATER-74) */}
      <TruncatedText
        text={column.name}
        className={cn('min-w-0 flex-1 text-sm', isTopLevel ? 'font-semibold' : 'font-medium')}
      />
      <div className="flex shrink-0 items-center">
        {isTopLevel && <CategoryDot category={column.category} />}
        <span
          className="text-muted-foreground px-1 text-xs tabular-nums"
          title={t('board.cardsCount', { count })}
        >
          {count}
        </span>
        {onAddCard && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('addCard.topLabel', { column: column.name })}
                onClick={onAddCard}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('addCard.topLabel', { column: column.name })}</TooltipContent>
          </Tooltip>
        )}
        {canManage && (
          <ActionsMenu label={t('column.menu', { name: column.name })} className="size-7">
            {(dialog) => (
              <>
                <DropdownMenuItem
                  onSelect={dialog(() => onAction({ kind: 'renameColumn', column }))}
                >
                  {t('column.rename')}
                </DropdownMenuItem>
                {isTopLevel && (
                  <>
                    <DropdownMenuItem
                      onSelect={dialog(() => onAction({ kind: 'addSubcolumn', parent: column }))}
                    >
                      {t('column.addSubcolumn')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={dialog(() =>
                        onAction({ kind: 'changeType', column, cardsCount: count }),
                      )}
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
                  onSelect={dialog(() => onAction({ kind: 'archiveColumn', column }))}
                >
                  {t('column.archive')}
                </DropdownMenuItem>
              </>
            )}
          </ActionsMenu>
        )}
      </div>
    </div>
  )
}

/**
 * Категория колонки — цветная точка с подсказкой «Очередь» / «В работе» / «Готово» вместо текстового бейджа (LATER-77):
 * название колонки получает всю ширину. Подсказка видна и по фокусу — точка в порядке Tab; цель — 24 px (WCAG 2.5.8).
 */
function CategoryDot({ category }: { category: BoardColumn['category'] }) {
  const { t } = useTranslation('boards')
  const label = t(`categories.${category}`)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className="focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
          data-category={category}
        >
          <span className={cn('size-2 rounded-full', CATEGORY_DOTS[category])} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
    <ActionsMenu label={t('lane.menu', { name: lane.name })} align="start" className="size-7">
      {(dialog) => (
        <>
          <DropdownMenuItem onSelect={dialog(() => onAction({ kind: 'renameLane', lane }))}>
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
            onSelect={dialog(() => onAction({ kind: 'archiveLane', lane }))}
          >
            {t('lane.archive')}
          </DropdownMenuItem>
        </>
      )}
    </ActionsMenu>
  )
}
