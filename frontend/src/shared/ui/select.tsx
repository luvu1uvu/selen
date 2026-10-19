import * as React from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * Нативный select в стиле shadcn/ui. Для простых списков (роль, часовой пояс)
 * нативный элемент доступнее и проще тестируется, чем Radix Select.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { NativeSelect }
