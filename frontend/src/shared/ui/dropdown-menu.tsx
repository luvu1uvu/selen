import * as React from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

/**
 * Рамка пункта в фокусе — только при работе с клавиатуры (LATER-115; так же у вкладок, `TabsTrigger`). Radix сам ставит
 * фокус на пункт под указателем, и Chromium считает такой фокус `:focus-visible` — рамка появлялась от наведения мышью.
 * Пока подсветку двигает указатель, меню помечено `data-pointer-focus` и рамка пунктов погашена; первая клавиша её
 * возвращает.
 */
function usePointerFocus<T extends HTMLElement>({
  onPointerMove,
  onKeyDown,
}: {
  onPointerMove?: React.PointerEventHandler<T>
  onKeyDown?: React.KeyboardEventHandler<T>
}) {
  const [pointer, setPointer] = React.useState(false)
  return {
    'data-pointer-focus': pointer || undefined,
    onPointerMove: (event: React.PointerEvent<T>) => {
      setPointer(true)
      onPointerMove?.(event)
    },
    onKeyDown: (event: React.KeyboardEvent<T>) => {
      setPointer(false)
      onKeyDown?.(event)
    },
  }
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  onPointerMove,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const pointerFocus = usePointerFocus({ onPointerMove, onKeyDown })
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...pointerFocus}
        className={cn(
          'bg-popover text-popover-foreground data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive focus-visible:outline-ring relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid in-data-pointer-focus:focus-visible:outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground focus-visible:outline-ring relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid in-data-pointer-focus:focus-visible:outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

/**
 * Пункт-переключатель группы (меню пользователя, «Тема»): значок и подпись слева, галочка у выбранного — справа, цветом
 * акцента (прототип «Линии», «Редизайн»).
 */
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground focus-visible:outline-ring relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid in-data-pointer-focus:focus-visible:outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="text-primary ml-auto flex">
        <CheckIcon className="size-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 text-sm font-medium', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground focus-visible:outline-ring flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid in-data-pointer-focus:focus-visible:outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  onPointerMove,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  const pointerFocus = usePointerFocus({ onPointerMove, onKeyDown })
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      {...pointerFocus}
      className={cn(
        'bg-popover text-popover-foreground data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md',
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
