import { readableTextOn } from '@/shared/lib/palette'
import { cn } from '@/shared/lib/utils'

/**
 * Метка карточки: цветная плашка с названием (на доске — компактная). Цвет метки — любой, текст — белый или чёрный,
 * что контрастнее (решение PM 21.10, LATER-89).
 */
export function LabelBadge({
  name,
  color,
  compact = false,
  className,
}: {
  name: string
  color: string
  compact?: boolean
  className?: string
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex max-w-full items-center truncate rounded font-medium',
        compact ? 'h-4 px-1.5 text-[10px] leading-4' : 'px-2 py-0.5 text-xs',
        className,
      )}
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}
