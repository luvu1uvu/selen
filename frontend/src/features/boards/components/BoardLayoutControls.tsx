import { useTranslation } from 'react-i18next'
import { useDraggable } from '@dnd-kit/core'
import { Archive, ArrowLeftRight, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import type { BoardMoveTarget } from '../api'
import type { BoardLayoutMoves } from '../layout'

/**
 * Ручка ⠿ перетаскивания доски на странице пространства (администратор пространства, ADR-0019) — только мышью: с
 * клавиатуры доску переставляют пункты меню «⋯» → «Переставить» (решение PM 6), поэтому ручка не получает фокус, а
 * подсказка говорит, где это сделать с клавиатуры. На экране 768 px и уже ряды — в колонку, ручки нет (там тоже — меню).
 */
export function BoardDragHandle({
  boardId,
  name,
  disabled,
}: {
  boardId: string
  name: string
  disabled: boolean
}) {
  const { t } = useTranslation('boards')
  const { setNodeRef, listeners } = useDraggable({ id: boardId, data: { name }, disabled })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={setNodeRef}
          {...listeners}
          aria-hidden
          className={cn(
            'text-muted-foreground hover:bg-accent hover:text-foreground rows:flex -ml-1 hidden size-7 shrink-0 touch-none items-center justify-center rounded-md',
            disabled ? 'cursor-default opacity-50' : 'cursor-grab',
          )}
          data-board-handle={boardId}
        >
          <GripVertical className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{t('layout.handle', { name })}</TooltipContent>
    </Tooltip>
  )
}

/** Свернуть ˄ / развернуть ˅ доску у себя (личный вид, ADR-0019) — как шеврон дорожки (LaneRow). */
export function BoardCollapseButton({
  name,
  collapsed,
  onToggle,
}: {
  name: string
  collapsed: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('boards')
  const label = t(collapsed ? 'layout.expand' : 'layout.collapse', { name })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={label}
          aria-expanded={!collapsed}
          // Щелчок мышью не оставляет рамку фокуса (как у шеврона дорожки): рамка — только с клавиатуры
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          data-board-collapse
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Пункты меню «⋯» доски на странице пространства (администратор пространства): «Переставить» — перестановка с
 * клавиатуры (решение PM 6) — и «Архивировать доску…». Недоступный пункт (доска и так с краю) — серый.
 */
export function BoardLayoutMenuItems({
  moves,
  disabled,
  onMove,
  onArchive,
}: {
  moves: BoardLayoutMoves
  disabled: boolean
  onMove: (target: BoardMoveTarget) => void
  onArchive: () => void
}) {
  const { t } = useTranslation('boards')
  const items: [keyof BoardLayoutMoves, string][] = [
    ['left', t('layout.left')],
    ['right', t('layout.right')],
    ['rowUp', t('layout.rowUp')],
    ['rowDown', t('layout.rowDown')],
    ['ownRow', t('layout.ownRow')],
  ]
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ArrowLeftRight />
          {t('layout.arrange')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {items.map(([key, label]) => {
            const target = moves[key]
            return (
              <DropdownMenuItem
                key={key}
                disabled={disabled || !target}
                onSelect={() => target && onMove(target)}
              >
                {label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem variant="destructive" onSelect={onArchive}>
        <Archive />
        {t('layout.archiveBoard')}
      </DropdownMenuItem>
    </>
  )
}
