import { cn } from '@/shared/lib/utils'

/** Метка карточки: цветная плашка с названием (на доске — компактная). */
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
        'inline-flex max-w-full items-center truncate rounded font-medium text-white',
        compact ? 'h-4 px-1.5 text-[10px] leading-4' : 'px-2 py-0.5 text-xs',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}
