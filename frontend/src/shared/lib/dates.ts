/**
 * Даты приходят с API в ISO 8601 (UTC) и показываются в часовом поясе пользователя.
 */
export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/**
 * Относительное время в прошлом: «3 дня назад», «1 месяц назад» (числом, а не «в прошлом месяце» — 30–59 дней) (правила вида, раздел 9). Меньше минуты —
 * null: подпись («только что») — у вызывающего. Точная дата — в подсказке, её даёт formatDateTime.
 */
export function formatRelative(value: string, now: Date = new Date()): string | null {
  const seconds = Math.max(0, (now.getTime() - new Date(value).getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'always' })
  for (const [unit, size] of RELATIVE_UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit)
  }
  return null
}
