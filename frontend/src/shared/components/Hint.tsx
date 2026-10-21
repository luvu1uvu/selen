import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/**
 * Подсказка Tooltip к значку без текста — тем же текстом, что его aria-label: видна по наведению и по фокусу
 * с клавиатуры (правила вида, раздел 8; CLAUDE.md, фронтенд, правило 8). `children` — элемент, получающий фокус.
 */
export function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
