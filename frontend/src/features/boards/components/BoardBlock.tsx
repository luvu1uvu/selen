import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Info, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { cn } from '@/shared/lib/utils'
import type { BoardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useSetAutoAssign } from '../queries'
import { ArchivedCardsDialog } from './ArchivedCardsDialog'
import { BoardView } from './BoardView'
import { StructureDialogs, type StructureAction } from './StructureDialogs'

/**
 * Блок доски (ADR-0019, docs/ui-reference/kaiten/README.md, раздел 03): шапка в одну строку — название, описание
 * за значком ⓘ, меню действий — и сама доска. Шапка и строка заголовков колонок закреплены вверху холста, пока
 * доска на экране; карточки прокручиваются под ними. Тот же блок — на странице доски и (дальше) в рядах досок
 * пространства.
 */
export function BoardBlock({
  board,
  heading: Heading = 'h2',
  breadcrumb,
  className,
  onOpenCard,
}: {
  board: BoardDetail
  heading?: 'h1' | 'h2'
  /** Перед названием: например, ссылка на пространство на странице одной доски. */
  breadcrumb?: ReactNode
  className?: string
  onOpenCard: (key: string) => void
}) {
  const { t } = useTranslation('boards')
  const [action, setAction] = useState<StructureAction>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Свёрнуты все дорожки (их больше одной — одну не свернуть) — доска из шапки, заголовков и полос: минимальная высота
  // оставила бы под полосами пустую область (замечание PM к PR 2)
  const collapsed = new Set(board.collapsed_lane_ids)
  const allLanesCollapsed =
    board.lanes.length > 1 && board.lanes.every((lane) => collapsed.has(lane.id))

  return (
    <section
      aria-label={board.name}
      // Блок на фоне холста (поправка PM 19.10, как в Kaiten): ширина — по колонкам, но не шире холста (тогда тело
      // прокручивается вбок внутри блока); не уже 20rem — шапка с названием и кнопками не ломается и при одной
      // колонке; высота — по содержимому, не ниже 15rem (шапка, заголовки и ячейка с «+ Карточка»), а при всех
      // свёрнутых дорожках — ровно по содержимому.
      // overflow: clip — содержимое обрезается по скруглённой рамке (уголки шапки, прижатой к верху холста, не торчат);
      // в отличие от hidden, clip не делает блок контейнером прокрутки, и закрепление шапки работает от холста
      className={cn(
        'bg-background flex w-fit max-w-full min-w-[min(20rem,100%)] flex-col self-start overflow-clip rounded-xl border',
        !allLanesCollapsed && 'min-h-60',
        className,
      )}
    >
      <header className="bg-background sticky top-0 z-20 flex h-12 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {breadcrumb}
          <Heading className="truncate text-base font-semibold">{board.name}</Heading>
          {/* ⓘ — только когда описание есть: пустое и из одних пробелов — значка нет (LATER-64) */}
          {board.description?.trim() && <BoardDescription text={board.description.trim()} />}
        </div>
        <BoardMenu board={board} onAction={setAction} onOpenArchive={() => setArchiveOpen(true)} />
      </header>

      {board.columns.length === 0 ? (
        <div className="text-muted-foreground m-3 flex-1 rounded-xl border border-dashed p-12 text-center">
          {t('board.noColumns')}
        </div>
      ) : (
        // Сбой доски не уносит шапку и остальное приложение
        <ErrorBoundary>
          <BoardView board={board} onOpenCard={onOpenCard} onAction={setAction} />
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
    </section>
  )
}

/** Описание доски (например, шаблон бага на «Багах приёмки» стенда PM) — во всплывающем окне, с переносами строк. */
function BoardDescription({ text }: { text: string }) {
  const { t } = useTranslation('boards')
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              aria-label={t('board.description')}
            >
              <Info />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('board.description')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
        <p className="text-sm whitespace-pre-line select-text">{text}</p>
      </PopoverContent>
    </Popover>
  )
}

/** «⋯»: архив карточек (editor и admin) и структура доски (администратор пространства). */
function BoardMenu({
  board,
  onAction,
  onOpenArchive,
}: {
  board: BoardDetail
  onAction: (action: StructureAction) => void
  onOpenArchive: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const setAutoAssign = useSetAutoAssign(board.id)
  // Пункт открывает окно — меню не возвращает фокус на «⋯»: иначе фокус вне модального окна, на «⋯» открывается
  // подсказка, и Esc закрывает её, а не окно
  const opensDialog = useRef(false)
  const dialog = (open: () => void) => () => {
    opensDialog.current = true
    open()
  }
  const { edit_cards: canEdit, manage: canManage } = board.permissions
  if (!canEdit && !canManage) return null

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={t('board.menu')}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('board.menu')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (opensDialog.current) event.preventDefault()
          opensDialog.current = false
        }}
      >
        {canEdit && (
          <DropdownMenuItem onSelect={dialog(onOpenArchive)}>
            <Archive />
            {t('archive.open')}
          </DropdownMenuItem>
        )}
        {canEdit && canManage && <DropdownMenuSeparator />}
        {canManage && (
          <>
            <DropdownMenuItem onSelect={dialog(() => onAction({ kind: 'addColumn' }))}>
              {t('board.addColumn')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={dialog(() => onAction({ kind: 'addLane' }))}>
              {t('board.addLane')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={dialog(() => onAction({ kind: 'renameBoard', name: board.name }))}
            >
              {t('board.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={dialog(() =>
                onAction({ kind: 'boardDescription', description: board.description }),
              )}
            >
              {t('board.editDescription')}
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
