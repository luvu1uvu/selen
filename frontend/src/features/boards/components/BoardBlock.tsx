import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Columns3, FileText, Info, Pencil, Rows3 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ActionsMenu, type OpensDialog } from '@/shared/components/ActionsMenu'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { TruncatedText } from '@/shared/components/TruncatedText'
import { cn } from '@/shared/lib/utils'
import type { BoardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { lastLaneCollapsed } from '../model'
import { BoardScopeContext, useSetAutoAssign } from '../queries'
import { ArchivedCardsDialog } from './ArchivedCardsDialog'
import { BoardView } from './BoardView'
import { StructureDialogs, type StructureAction } from './StructureDialogs'

/** Что добавляет в шапку доски страница пространства (ряды досок, ADR-0019). */
export interface BoardHeaderSlots {
  /** Первым в шапке: ручка ⠿ перетаскивания доски (администратор пространства). */
  leading?: ReactNode
  /** Последним в шапке: свернуть доску ˄. */
  trailing?: ReactNode
  /**
   * Пункты в конце меню «⋯»: перестановка доски и архив (администратор пространства). opensDialog — обёртка для
   * пункта, который открывает окно: меню тогда не возвращает фокус на «⋯».
   */
  menuItems?: (opensDialog: OpensDialog) => ReactNode
}

/** Меню «⋯» в шапке доски: на странице пространства досок несколько — у каждого «⋯» своё имя (с названием доски). */
export function BoardMenuShell({
  name,
  children,
}: {
  name: string
  children: (opensDialog: OpensDialog) => ReactNode
}) {
  const { t } = useTranslation('boards')
  return (
    <ActionsMenu label={t('board.menu', { name })} className="size-7">
      {children}
    </ActionsMenu>
  )
}

/**
 * Шапка доски в одну строку (h-12): [⠿] [ссылка на пространство] название [ⓘ] [после названия] … [кнопки]. Общая для
 * развёрнутой доски, свёрнутой («Название · N карточек») и доски, которая ещё грузится.
 */
export function BoardHeader({
  name,
  heading: Heading = 'h2',
  leading,
  breadcrumb,
  description,
  afterName,
  children,
  className,
  onClick,
}: {
  name: string
  heading?: 'h1' | 'h2'
  leading?: ReactNode
  breadcrumb?: ReactNode
  description?: string | null
  afterName?: ReactNode
  /** Справа: меню «⋯», свернуть. */
  children?: ReactNode
  className?: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <header
      className={cn('bg-board flex h-12 items-center gap-2 px-3', className)}
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {leading}
        {breadcrumb}
        <TruncatedText as={Heading} text={name} className="text-base font-semibold" />
        {/* ⓘ — только когда описание есть: пустое и из одних пробелов — значка нет (LATER-64) */}
        {description?.trim() && <BoardDescription name={name} text={description.trim()} />}
        {afterName}
      </div>
      {children}
    </header>
  )
}

/**
 * Блок доски (ADR-0019, docs/ui-reference/kaiten/README.md, раздел 03): шапка в одну строку — название, описание
 * за значком ⓘ, меню действий — и сама доска. Шапка и строка заголовков колонок закреплены вверху холста, пока
 * доска на экране; карточки прокручиваются под ними. Тот же блок — на странице доски и в рядах досок пространства
 * (там в шапке ещё ручка ⠿, свернуть и пункты перестановки — slots).
 */
export function BoardBlock({
  board,
  heading = 'h2',
  breadcrumb,
  slots,
  className,
  style,
  onOpenCard,
}: {
  board: BoardDetail
  heading?: 'h1' | 'h2'
  /** Перед названием: например, ссылка на пространство на странице одной доски. */
  breadcrumb?: ReactNode
  slots?: BoardHeaderSlots
  className?: string
  style?: CSSProperties
  onOpenCard: (key: string) => void
}) {
  const { t } = useTranslation('boards')
  const [action, setAction] = useState<StructureAction>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Свёрнута последняя дорожка — блок кончается её полосой: минимальная высота оставила бы под ней пустую область
  // (LATER-70)
  const endsWithBand = lastLaneCollapsed(board)

  return (
    // Изменения структуры внутри блока перечитывают эту доску, а не все загруженные (useInvalidateBoards)
    <BoardScopeContext.Provider value={board.id}>
      <section
        aria-label={board.name}
        // Блок на фоне холста (поправка PM 19.10, как в Kaiten): ширина — по колонкам, но не шире холста (тогда тело
        // прокручивается вбок внутри блока); не уже 20rem — шапка с названием и кнопками не ломается и при одной
        // колонке; высота — по содержимому, не ниже 15rem (шапка, заголовки и ячейка с «+ Карточка»), а при свёрнутой
        // последней дорожке — ровно по содержимому.
        // overflow: clip — содержимое обрезается по скруглённой рамке (уголки шапки, прижатой к верху холста, не торчат);
        // в отличие от hidden, clip не делает блок контейнером прокрутки, и закрепление шапки работает от холста.
        // relative — для затенения краёв тела доски (BoardView, EdgeShade)
        className={cn(
          'bg-board relative flex w-fit max-w-full min-w-[min(20rem,100%)] flex-col self-start overflow-clip rounded-xl border',
          !endsWithBand && 'min-h-60',
          className,
        )}
        style={style}
        data-board-block={board.id}
      >
        <BoardHeader
          name={board.name}
          heading={heading}
          leading={slots?.leading}
          breadcrumb={breadcrumb}
          description={board.description}
          className="sticky top-0 z-20 border-b"
        >
          <BoardMenu
            board={board}
            extraItems={slots?.menuItems}
            onAction={setAction}
            onOpenArchive={() => setArchiveOpen(true)}
          />
          {slots?.trailing}
        </BoardHeader>

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
    </BoardScopeContext.Provider>
  )
}

/** Описание доски (например, шаблон бага на «Багах приёмки» стенда PM) — во всплывающем окне, с переносами строк. */
function BoardDescription({ name, text }: { name: string; text: string }) {
  const { t } = useTranslation('boards')
  const label = t('board.description', { name })
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              aria-label={label}
            >
              <Info />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
        <p className="text-sm whitespace-pre-line select-text">{text}</p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * «⋯»: архив карточек (editor и admin) и структура доски (администратор пространства); на странице пространства — ещё
 * перестановка доски и её архив (extraItems).
 */
function BoardMenu({
  board,
  extraItems,
  onAction,
  onOpenArchive,
}: {
  board: BoardDetail
  extraItems?: (opensDialog: OpensDialog) => ReactNode
  onAction: (action: StructureAction) => void
  onOpenArchive: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const setAutoAssign = useSetAutoAssign(board.id)
  const { edit_cards: canEdit, manage: canManage } = board.permissions
  if (!canEdit && !canManage && !extraItems) return null

  return (
    <BoardMenuShell name={board.name}>
      {(dialog) => (
        <>
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
                <Columns3 />
                {t('board.addColumn')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={dialog(() => onAction({ kind: 'addLane' }))}>
                <Rows3 />
                {t('board.addLane')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={dialog(() => onAction({ kind: 'renameBoard', name: board.name }))}
              >
                <Pencil />
                {t('board.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={dialog(() =>
                  onAction({ kind: 'boardDescription', description: board.description }),
                )}
              >
                <FileText />
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
          {extraItems && (
            <>
              {(canEdit || canManage) && <DropdownMenuSeparator />}
              {extraItems(dialog)}
            </>
          )}
        </>
      )}
    </BoardMenuShell>
  )
}
