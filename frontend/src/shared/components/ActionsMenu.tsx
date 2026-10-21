import { useRef, type FocusEvent, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { restoreFocusQuietly } from '@/shared/ui/restore-focus'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/** Обёртка обработчика пункта меню, который открывает окно (см. ActionsMenu). */
export type OpensDialog = (open: () => void) => () => void

/**
 * Подсказка «⋯» по фокусу — только при фокусе с клавиатуры. После пункта, выбранного мышью, меню возвращает фокус на «⋯»,
 * и подсказка висела бы, пока фокус не уйдёт: указатель над «⋯» не возвращался. Отменённое событие фокуса Radix Tooltip
 * пропускает; наведение подсказку открывает, как раньше.
 */
function hideHintUnlessKeyboard(event: FocusEvent<HTMLButtonElement>) {
  if (!event.currentTarget.matches(':focus-visible')) event.preventDefault()
}

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
  icon = <MoreHorizontal />,
  children,
}: {
  label: string
  align?: 'start' | 'end'
  /** Размер кнопки: на доске и панели пространства — `size-7` (правила вида, раздел 4). */
  className?: string
  /** Значок кнопки: «⋯» по умолчанию; «+» — меню «Добавить в карточку» окна карточки. */
  icon?: ReactNode
  children: (opensDialog: OpensDialog) => ReactNode
}) {
  const pending = useRef<(() => void) | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
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
              ref={trigger}
              aria-label={label}
              onFocus={hideHintUnlessKeyboard}
            >
              {icon}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align={align}
        onCloseAutoFocus={(event) => {
          // Фокус на «⋯» возвращаем сами и без подсказки: открытая подсказка забрала бы следующий Esc у окна под
          // меню (U-5 UX-ревью UI-1a, как LATER-94)
          event.preventDefault()
          restoreFocusQuietly(trigger.current)
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
