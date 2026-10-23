import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dueState, formatDue, type DueFields } from '@/shared/lib/due'
import { cn } from '@/shared/lib/utils'

const STYLES = {
  none: '',
  pending: 'text-muted-foreground',
  overdue: 'bg-danger-muted text-danger-foreground',
  missed: 'bg-danger-muted text-danger-foreground',
  met: 'bg-success-muted text-success-foreground',
} as const

/**
 * Срок с подсветкой (как в Kaiten): просрочен — красный; завершена в срок — зелёный, после срока — красный.
 */
export function DueBadge({
  card,
  now,
  timeZone,
  className,
}: {
  card: DueFields
  now: Date
  timeZone?: string
  className?: string
}) {
  const { t } = useTranslation('boards')
  const state = dueState(card, now, timeZone)
  if (state === 'none') return null
  const label = formatDue(card, now, timeZone)

  return (
    <span
      title={t(`due.states.${state}`, { date: label })}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 text-xs whitespace-nowrap',
        STYLES[state],
        className,
      )}
    >
      <CalendarClock className="size-3" aria-hidden />
      <span aria-hidden>{label}</span>
      <span className="sr-only">{t(`due.states.${state}`, { date: label })}</span>
    </span>
  )
}
