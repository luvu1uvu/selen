import { useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/**
 * Однострочное название с многоточием (правила вида, разделы 6 и 8): обрезано — полный текст в подсказке Tooltip по
 * наведению и по фокусу. Чтобы подсказку было видно и с клавиатуры, обрезанное название получает фокус (Tab); целиком
 * видное — без подсказки и без лишней остановки Tab (LATER-74).
 */
export function TruncatedText({
  text,
  as: Tag = 'span',
  className,
}: {
  text: string
  as?: 'span' | 'h1' | 'h2' | 'h3'
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const truncated = useTruncated(ref, text)
  // Подсказка управляемая: у целиком видного названия она не открывается вовсе (и не ссылается на пустое описание)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={truncated && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Tag
          ref={ref as RefObject<HTMLHeadingElement>}
          className={cn(
            'focus-visible:ring-ring truncate outline-none focus-visible:ring-[3px]',
            className,
          )}
          tabIndex={truncated ? 0 : undefined}
          data-truncated={truncated || undefined}
        >
          {text}
        </Tag>
      </TooltipTrigger>
      {truncated && <TooltipContent className="max-w-sm break-words">{text}</TooltipContent>}
    </Tooltip>
  )
}

/**
 * Название внутри ссылки или кнопки во всю строку (строка дерева, LATER-109): полное название в подсказке показывает
 * сама строка — по наведению и по фокусу, если название в ней обрезано (`nameRef` — элемент названия с `truncate`).
 * Своей остановки Tab у названия нет: фокусируемое внутри ссылки недопустимо, а строка и так получает фокус.
 */
export function TruncatedTrigger({
  text,
  nameRef,
  children,
}: {
  text: string
  nameRef: RefObject<HTMLElement | null>
  children: ReactElement
}) {
  const truncated = useTruncated(nameRef, text)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={truncated && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {truncated && (
        <TooltipContent side="right" className="max-w-sm break-words">
          {text}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

/** Текст не помещается в элемент: пересчёт при смене текста и размера элемента. */
function useTruncated(ref: RefObject<HTMLElement | null>, text: string) {
  const [truncated, setTruncated] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, text])
  return truncated
}
