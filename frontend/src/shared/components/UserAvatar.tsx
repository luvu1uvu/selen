import { cn } from '@/shared/lib/utils'

/** Палитра фона аватаров — цвет стабилен для человека (по id). */
const COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#db2777',
  '#0891b2',
  '#dc2626',
  '#4b5563',
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[1]?.[0] ?? '') : '')
}

function colorFor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

/**
 * Аватар-инициалы (фото в системе нет). Подсказка с именем — через title, без всплывающих компонентов:
 * на доске сотни аватаров.
 */
export function UserAvatar({
  id,
  name,
  label = name,
  size = 'sm',
  className,
}: {
  id: string
  name: string
  /** Подпись для подсказки и скринридера (по умолчанию — имя). */
  label?: string
  size?: 'xs' | 'sm'
  className?: string
}) {
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white uppercase select-none',
        size === 'xs' ? 'size-5 text-[10px]' : 'size-7 text-xs',
        className,
      )}
      style={{ backgroundColor: colorFor(id) }}
    >
      {initials(name)}
    </span>
  )
}
