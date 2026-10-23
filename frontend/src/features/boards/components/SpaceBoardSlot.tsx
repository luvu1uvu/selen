import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import type { SpaceBoard } from '@/shared/types/api'
import type { BoardMoveTarget } from '../api'
import { BoardPopupsContext, type BoardPopup } from '../boardPopups'
import {
  boardEstimatedHeight,
  boardLayoutMoves,
  boardNaturalWidth,
  type BoardRowView,
} from '../layout'
import { boardKeys, useBoard } from '../queries'
import { useNearViewport } from '../useNearViewport'
import { BoardBlock, BoardHeader, BoardMenuShell, type BoardHeaderSlots } from './BoardBlock'
import { BoardCollapseButton, BoardDragHandle, BoardLayoutMenuItems } from './BoardLayoutControls'

export interface SpaceBoardSlotProps {
  board: SpaceBoard
  rows: BoardRowView[]
  /** Администратор пространства: ручка ⠿, пункты «Переставить» и «Архивировать доску…». */
  canManage: boolean
  /** Доска первого экрана: грузится сразу, не дожидаясь IntersectionObserver (действует при появлении места). */
  eager: boolean
  /** Место есть, но доска пока не видна: ряд первого экрана ещё грузится (U-1 UX-ревью варианта Б). */
  concealed?: boolean
  /** Идёт перестановка — следующая недоступна (useMoveBoard). */
  moving: boolean
  /** Эту доску сейчас переносят мышью — она приглушена, пока на её месте не окажется копия. */
  dragging: boolean
  onMove: (boardId: string, target: BoardMoveTarget) => void
  onToggleCollapsed: (boardId: string, collapsed: boolean) => void
  onArchive: (board: SpaceBoard) => void
  onOpenCard: (key: string) => void
  /** Доска загрузилась (или не смогла) — для показа рядов ниже первого экрана без «прыжка». */
  onSettled: (boardId: string) => void
}

/**
 * Место доски в ряду на странице пространства (ADR-0019). Доска не сжимается: место — её ширина по колонкам (известна
 * без загрузки), не шире холста — только доска шире холста прокручивается вбок внутри блока; не поместилась в строку —
 * ряд переносит её на следующую (решение PM 21.10, вариант Б). Свёрнутая — по своей шапке «Название · N карточек»,
 * соседи справа сдвигаются (ответ PM 19.10). На экране 768 px и уже — во всю ширину.
 *
 * Развёрнутая доска загружается, когда подходит к видимой части холста (до этого — заглушка той же ширины);
 * свёрнутая не загружается вовсе — счётчик приходит в списке досок.
 */
export const SpaceBoardSlot = memo(function SpaceBoardSlot(props: SpaceBoardSlotProps) {
  const { board, dragging } = props
  const slotRef = useRef<HTMLDivElement>(null)
  // Доска уже в кеше (была загружена, переехала в другой ряд, вернулись «Назад») — рисуется сразу, без заглушки
  const cached = useQueryClient().getQueryData(boardKeys.detail(board.id)) !== undefined
  const near = useNearViewport(slotRef, !board.collapsed, props.eager || cached)
  useScrollAnchorFallback(slotRef)

  useKeepCollapseFocus(slotRef)
  // Открытые «⋯» и ⓘ шапки переживают замену заглушки загруженной доской (LATER-99)
  const popup = useState<BoardPopup>(null)

  return (
    // tabIndex −1: доска из дерева получает фокус (без рамки) — следующий Tab ведёт в неё (U-3 UX-ревью PR 3)
    <BoardPopupsContext.Provider value={popup}>
      <div
        ref={slotRef}
        tabIndex={-1}
        className={cn(
          'max-rows:w-full rows:max-w-full rows:flex-none min-w-0 outline-none',
          board.collapsed ? 'rows:w-fit' : 'rows:w-(--slot-w)',
          props.concealed && 'invisible',
          dragging && 'opacity-50',
        )}
        style={
          board.collapsed
            ? undefined
            : ({ '--slot-w': `${boardNaturalWidth(board.leaf_columns_count)}px` } as CSSProperties)
        }
        data-board-slot={board.id}
      >
        {board.collapsed ? (
          <CollapsedBoard {...props} />
        ) : near ? (
          <LoadedBoard {...props} />
        ) : (
          <BoardPlaceholder {...props} />
        )}
      </div>
    </BoardPopupsContext.Provider>
  )
}, sameSlot)

/**
 * Список рядов меняется при любой перестановке и сворачивании; доску это касается, только если сменились её пункты
 * «Переставить» — иначе блок с сотнями карточек не перерисовывается.
 */
function sameSlot(previous: SpaceBoardSlotProps, next: SpaceBoardSlotProps) {
  for (const key of Object.keys(next) as (keyof SpaceBoardSlotProps)[]) {
    if (key !== 'rows' && previous[key] !== next[key]) return false
  }
  return (
    previous.rows === next.rows ||
    !next.canManage ||
    JSON.stringify(boardLayoutMoves(previous.rows, next.board.id)) ===
      JSON.stringify(boardLayoutMoves(next.rows, next.board.id))
  )
}

/** Ручка, свернуть и пункты меню раскладки — одинаковые у всех состояний доски. */
function useLayoutSlots({
  board,
  rows,
  canManage,
  moving,
  onMove,
  onToggleCollapsed,
  onArchive,
}: SpaceBoardSlotProps): BoardHeaderSlots {
  const moves = useMemo(() => boardLayoutMoves(rows, board.id), [rows, board.id])
  return {
    leading: canManage ? (
      <BoardDragHandle boardId={board.id} name={board.name} disabled={moving} />
    ) : null,
    trailing: (
      <BoardCollapseButton
        name={board.name}
        collapsed={board.collapsed}
        onToggle={() => onToggleCollapsed(board.id, !board.collapsed)}
      />
    ),
    // Только администратору пространства: у остальных этих пунктов нет, а пустое место в меню дало бы «⋯» без пунктов
    menuItems: canManage
      ? (dialog) => (
          <BoardLayoutMenuItems
            moves={moves}
            disabled={moving}
            onMove={(target) => onMove(board.id, target)}
            onArchive={dialog(() => onArchive(board))}
          />
        )
      : undefined,
  }
}

/** Меню «⋯» доски, у которой нет загруженного содержимого (свёрнута, грузится): только раскладка и архив. */
function LayoutOnlyMenu({
  name,
  menuItems,
}: {
  name: string
  menuItems: BoardHeaderSlots['menuItems']
}) {
  if (!menuItems) return null
  return <BoardMenuShell name={name}>{(dialog) => menuItems(dialog)}</BoardMenuShell>
}

/**
 * Свёрнутая доска — только шапка «Название · N карточек» (видимых пользователю активных карточек, ADR-0008); блок по
 * ширине шапки. Щелчок по шапке разворачивает (как свёрнутая дорожка); кнопки и ручка — нет.
 */
function CollapsedBoard(props: SpaceBoardSlotProps) {
  const { t } = useTranslation('boards')
  const { board, onToggleCollapsed } = props
  const slots = useLayoutSlots(props)
  const expandOnClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as Element
    if (event.currentTarget.contains(target) && !target.closest('button, [data-board-handle]'))
      onToggleCollapsed(board.id, false)
  }
  return (
    <section
      aria-label={board.name}
      className="bg-board max-rows:w-full w-fit max-w-full overflow-clip rounded-xl border"
      data-board-block={board.id}
      data-board-collapsed
    >
      <BoardHeader
        name={board.name}
        leading={slots.leading}
        description={board.description}
        afterName={
          <span className="text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums">
            · {t('layout.cardsCount', { count: board.cards_count })}
          </span>
        }
        className="hover:bg-accent cursor-pointer"
        onClick={expandOnClick}
      >
        <LayoutOnlyMenu name={board.name} menuItems={slots.menuItems} />
        {slots.trailing}
      </BoardHeader>
    </section>
  )
}

/**
 * Доска ещё не загружена (далеко от экрана или идёт запрос): шапка и место той же ширины и примерно той же высоты
 * (оценка снизу по числу карточек), не ниже 15rem.
 */
function BoardPlaceholder(props: SpaceBoardSlotProps & { failed?: boolean }) {
  const { t } = useTranslation('boards')
  const { board, failed } = props
  const slots = useLayoutSlots(props)
  return (
    <section
      aria-label={board.name}
      aria-busy={!failed}
      className="bg-board flex min-h-60 w-full flex-col overflow-clip rounded-xl border"
      style={
        failed
          ? undefined
          : { minHeight: boardEstimatedHeight(board.leaf_columns_count, board.cards_count) }
      }
      data-board-block={board.id}
      data-board-placeholder
    >
      <BoardHeader
        name={board.name}
        leading={slots.leading}
        description={board.description}
        className="border-b"
      >
        <LayoutOnlyMenu name={board.name} menuItems={slots.menuItems} />
        {slots.trailing}
      </BoardHeader>
      <p className={cn('p-3 text-sm', failed ? 'text-destructive' : 'text-muted-foreground')}>
        {failed ? t('layout.loadFailed') : t('layout.loading')}
      </p>
    </section>
  )
}

function LoadedBoard(props: SpaceBoardSlotProps) {
  const { board: summary, onOpenCard, onSettled } = props
  const query = useBoard(summary.id)
  const slots = useLayoutSlots(props)
  const settled = query.data !== undefined || query.isError
  useEffect(() => {
    if (settled) onSettled(summary.id)
  }, [settled, summary.id, onSettled])
  // Неудачное фоновое обновление уже показанной доски её не прячет
  if (!query.data) return <BoardPlaceholder {...props} failed={query.isError} />
  return (
    <BoardBlock
      board={query.data}
      slots={slots}
      className="max-rows:w-full"
      onOpenCard={onOpenCard}
    />
  )
}

/**
 * Свернули или развернули доску с клавиатуры — фокус остаётся на шевроне. Свёрнутая, ещё грузящаяся и загруженная
 * доска — разные элементы, и шеврон каждый раз новый: без этого фокус уходил в body (U-1 UX-ревью PR 3). Был фокус на
 * шевроне этой доски и пропал вместе с ним (не ушёл на другой элемент) — ставим его на новый шеврон.
 */
function useKeepCollapseFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const slot = ref.current
    if (!slot) return
    let held = false
    const onFocusIn = (event: FocusEvent) => {
      held = (event.target as Element).matches('[data-board-collapse]')
    }
    const onFocusOut = (event: FocusEvent) => {
      const button = event.target as Element
      // Фокус ушёл с шеврона сам (Tab, щелчок) — отпускаем; шеврон убрали со страницы — держим. Уход с другого элемента
      // не в счёт: Tab с «⋯» на шеврон отпустил бы фокус уже после того, как его взял шеврон (U-4 UX-ревью варианта Б)
      if (!button.matches('[data-board-collapse]')) return
      setTimeout(() => {
        if (button.isConnected) held = false
      })
    }
    const observer = new MutationObserver(() => {
      if (!held || slot.contains(document.activeElement)) return
      slot.querySelector<HTMLElement>('[data-board-collapse]')?.focus({ preventScroll: true })
    })
    slot.addEventListener('focusin', onFocusIn)
    slot.addEventListener('focusout', onFocusOut)
    observer.observe(slot, { childList: true, subtree: true })
    return () => {
      slot.removeEventListener('focusin', onFocusIn)
      slot.removeEventListener('focusout', onFocusOut)
      observer.disconnect()
    }
  }, [ref])
}

/**
 * Доска выше видимой части холста выросла (загрузилась) — холст сдвигается на столько же, чтобы на экране ничего не
 * уехало. Браузеры с привязкой прокрутки (overflow-anchor) делают это сами; это — для остальных (Safari).
 */
function useScrollAnchorFallback(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element || typeof CSS === 'undefined' || CSS.supports('overflow-anchor', 'auto')) return
    const canvas = element.closest<HTMLElement>('[data-board-canvas]')
    if (!canvas) return
    let height = element.offsetHeight
    const observer = new ResizeObserver(() => {
      const next = element.offsetHeight
      const rect = element.getBoundingClientRect()
      // Целиком выше видимой части (по прежней высоте): её рост сдвинул бы всё, что на экране
      if (rect.top + height <= canvas.getBoundingClientRect().top) canvas.scrollTop += next - height
      height = next
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
}
