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
