import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Рамка фокуса у вкладки — только при работе с клавиатуры (решение PM 22.10, U-1 UX-ревью LATER-91). Radix сам ставит
 * фокус на вкладку при нажатии мыши, и браузер может счесть его фокусом «с клавиатуры» (`:focus-visible` — например,
 * сразу после загрузки страницы). Поэтому фокус от указателя помечается `data-pointer-focus` до первой клавиши или ухода
 * фокуса; стрелки переводят фокус на соседнюю вкладку — у неё рамка есть.
 */
function TabsTrigger({
  className,
  onPointerDown,
  onKeyDown,
  onBlur,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const [pointerFocus, setPointerFocus] = React.useState(false)
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-pointer-focus={pointerFocus || undefined}
      onPointerDown={(event) => {
        setPointerFocus(true)
        onPointerDown?.(event)
      }}
      onKeyDown={(event) => {
        setPointerFocus(false)
        onKeyDown?.(event)
      }}
      onBlur={(event) => {
        setPointerFocus(false)
        onBlur?.(event)
      }}
      className={cn(
        'focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-pointer-focus:focus-visible:ring-0 data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
