import { useRef, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/** Обёртка обработчика пункта меню, который открывает окно (см. ActionsMenu). */
export type OpensDialog = (open: () => void) => () => void

/**
 * Кнопка «⋯» с меню действий: подпись для экранного диктора — она же в подсказке Tooltip по наведению и по фокусу
 * (CLAUDE.md, фронтенд, правило 8; LATER-75, LATER-80). Название объекта в подписи — в «ёлочках»: «Действия с колонкой
 * «Backlog»».
 *
 * Пункт, который открывает окно, оборачивается в `opensDialog`: окно открывается после того, как меню вернуло фокус на
 * «⋯», и забирает его (подсказка «⋯» закрывается — Esc закрывает окно, а не её), а закрытое окно возвращает фокус на «⋯»
 * (useRestoreFocus; раньше фокус уходил в body — U-6 UX-ревью PR 3).
 */
export function ActionsMenu({
  label,
  align = 'end',
  className,
  children,
}: {
  label: string
  align?: 'start' | 'end'
  /** Размер кнопки: на доске и панели пространства — `size-7` (правила вида, раздел 4). */
  className?: string
  children: (opensDialog: OpensDialog) => ReactNode
}) {
  const pending = useRef<(() => void) | null>(null)
  const dialog: OpensDialog = (open) => () => {
    pending.current = open
  }
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('shrink-0', className)}
              aria-label={label}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align={align}
        onCloseAutoFocus={() => {
          const open = pending.current
          pending.current = null
          // Фокус сейчас вернётся на «⋯» — окно откроется кадром позже
          if (open) requestAnimationFrame(open)
        }}
      >
        {children(dialog)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
