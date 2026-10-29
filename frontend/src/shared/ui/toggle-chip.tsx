import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/**
 * Чип-переключатель (`aria-pressed`): роли (несколько сразу), «Сотруднику / Группе». Выбранный — рамка `primary`,
 * подложка `selected` и галочка (правила вида, раздел 7). Место галочки и жирность заняты у всех чипов — при выборе
 * ширина не меняется и соседи не сдвигаются (UX-ревью П2d-1, U-1); рамка фокуса — общая, своей у чипа нет (U-3).
 * invalid — ошибка поля: красная рамка у невыбранных.
 */
function ToggleChip({
  pressed,
  invalid = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'button'>, 'type'> & { pressed: boolean; invalid?: boolean }) {
  return (
    <button
      type="button"
      data-slot="toggle-chip"
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        pressed
          ? 'border-primary bg-selected text-foreground'
          : cn(
              invalid ? 'border-destructive' : 'border-input',
              'text-muted-foreground hover:bg-accent hover:text-foreground',
            ),
        className,
      )}
      {...props}
    >
      <Check className={cn('size-3.5', !pressed && 'invisible')} aria-hidden />
      {children}
    </button>
  )
}

export { ToggleChip }
