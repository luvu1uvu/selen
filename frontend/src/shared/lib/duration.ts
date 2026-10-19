import type { TFunction } from 'i18next'

/** Длительность в секундах → «2 д 3 ч», «5 ч 10 мин», «меньше минуты». */
export function formatDuration(seconds: number, t: TFunction<'boards'>): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return t('duration.lessThanMinute')

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const rest = minutes % 60

  const parts: string[] = []
  if (days) parts.push(t('duration.days', { count: days }))
  if (hours) parts.push(t('duration.hours', { count: hours }))
  if (rest && !days) parts.push(t('duration.minutes', { count: rest }))
  return parts.join(' ')
}
