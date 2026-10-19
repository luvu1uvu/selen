/**
 * Срок карточки: либо дата без времени (due_date, YYYY-MM-DD), либо точный момент (due_at, UTC).
 * Дата без времени — это день в часовом поясе пользователя: срок истекает в конце этого дня.
 */
export interface DueFields {
  due_date: string | null
  due_at: string | null
  completed_at: string | null
}

/**
 * none — срока нет; pending — срок не наступил; overdue — просрочено (не завершена);
 * met — завершена в срок; missed — завершена после срока. Как в Kaiten: overdue и missed — красным,
 * met — зелёным.
 */
export type DueState = 'none' | 'pending' | 'overdue' | 'met' | 'missed'

/** Календарная дата момента в часовом поясе: YYYY-MM-DD. */
export function dateInZone(moment: Date, timeZone?: string): string {
  // en-CA форматирует дату как YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment)
}

export function dueState(card: DueFields, now: Date, timeZone?: string): DueState {
  if (card.due_at) {
    const due = new Date(card.due_at).getTime()
    if (card.completed_at) return new Date(card.completed_at).getTime() <= due ? 'met' : 'missed'
    return now.getTime() > due ? 'overdue' : 'pending'
  }
  if (card.due_date) {
    // Строки YYYY-MM-DD сравниваются как даты
    if (card.completed_at) {
      return dateInZone(new Date(card.completed_at), timeZone) <= card.due_date ? 'met' : 'missed'
    }
    return dateInZone(now, timeZone) > card.due_date ? 'overdue' : 'pending'
  }
  return 'none'
}

/** Короткая подпись срока: «20 окт.» или «20 окт., 18:30»; год — если не текущий. */
export function formatDue(card: DueFields, now: Date, timeZone?: string): string {
  if (card.due_at) {
    const due = new Date(card.due_at)
    const sameYear = dateInZone(due, timeZone).slice(0, 4) === dateInZone(now, timeZone).slice(0, 4)
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(due)
  }
  if (card.due_date) {
    const sameYear = card.due_date.slice(0, 4) === dateInZone(now, timeZone).slice(0, 4)
    // Дата без времени не зависит от часового пояса: форматируем как полночь UTC в UTC
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    }).format(new Date(`${card.due_date}T00:00:00Z`))
  }
  return ''
}

/** Смещение часового пояса относительно UTC в момент ts, мс. */
function zoneOffset(ts: number, timeZone?: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ts))
      .map((part) => [part.type, part.value]),
  )
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  )
  return asUtc - Math.floor(ts / 1000) * 1000
}

/**
 * Дата и время, введённые пользователем в его часовом поясе (из профиля, не браузера), — в ISO 8601 UTC.
 */
export function zonedToIso(date: string, time: string, timeZone?: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let ts = guess - zoneOffset(guess, timeZone)
  // Переход на летнее/зимнее время: смещение в найденный момент может отличаться
  const corrected = guess - zoneOffset(ts, timeZone)
  if (corrected !== ts) ts = corrected
  return new Date(ts).toISOString().replace('.000Z', 'Z')
}

/** Момент (ISO) — дата YYYY-MM-DD и время HH:MM в часовом поясе пользователя (для полей ввода). */
export function isoToZoned(iso: string, timeZone?: string): { date: string; time: string } {
  const moment = new Date(iso)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(moment)
  return { date: dateInZone(moment, timeZone), time }
}
