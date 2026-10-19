import { describe, expect, it } from 'vitest'
import { dateInZone, dueState, formatDue, isoToZoned, zonedToIso } from './due'

const MSK = 'Europe/Moscow'
const card = (fields: Partial<{ due_date: string; due_at: string; completed_at: string }>) => ({
  due_date: null,
  due_at: null,
  completed_at: null,
  ...fields,
})

describe('dueState', () => {
  it('без срока — none', () => {
    expect(dueState(card({}), new Date('2026-10-20T10:00:00Z'), MSK)).toBe('none')
  })

  it('дата без времени истекает в конце дня по часовому поясу пользователя', () => {
    const due = card({ due_date: '2026-10-20' })
    // 23:30 по Москве 20-го — ещё в срок; 00:30 21-го — просрочено
    expect(dueState(due, new Date('2026-10-20T20:30:00Z'), MSK)).toBe('pending')
    expect(dueState(due, new Date('2026-10-20T21:30:00Z'), MSK)).toBe('overdue')
    // В UTC тот же момент — ещё 20-е
    expect(dueState(due, new Date('2026-10-20T21:30:00Z'), 'UTC')).toBe('pending')
  })

  it('срок со временем сравнивается по моменту', () => {
    const due = card({ due_at: '2026-10-20T15:00:00Z' })
    expect(dueState(due, new Date('2026-10-20T14:59:00Z'), MSK)).toBe('pending')
    expect(dueState(due, new Date('2026-10-20T15:01:00Z'), MSK)).toBe('overdue')
  })

  it('завершённая карточка: успели — met, нет — missed (как в Kaiten)', () => {
    const now = new Date('2026-11-01T00:00:00Z')
    expect(
      dueState(card({ due_date: '2026-10-20', completed_at: '2026-10-20T20:00:00Z' }), now, MSK),
    ).toBe('met')
    expect(
      dueState(card({ due_date: '2026-10-20', completed_at: '2026-10-20T21:30:00Z' }), now, MSK),
    ).toBe('missed')
    expect(
      dueState(
        card({ due_at: '2026-10-20T15:00:00Z', completed_at: '2026-10-20T15:00:00Z' }),
        now,
        MSK,
      ),
    ).toBe('met')
    expect(
      dueState(
        card({ due_at: '2026-10-20T15:00:00Z', completed_at: '2026-10-20T15:00:01Z' }),
        now,
        MSK,
      ),
    ).toBe('missed')
  })
})

describe('formatDue', () => {
  const now = new Date('2026-10-13T10:00:00Z')

  it('дата без времени — без сдвига часового пояса', () => {
    expect(formatDue(card({ due_date: '2026-10-20' }), now, 'America/New_York')).toBe('20 окт.')
  })

  it('со временем — в часовом поясе пользователя; год — если не текущий', () => {
    expect(formatDue(card({ due_at: '2026-10-20T15:30:00Z' }), now, MSK)).toBe('20 окт., 18:30')
    expect(formatDue(card({ due_date: '2027-01-05' }), now, MSK)).toBe('5 янв. 2027 г.')
  })

  it('dateInZone — календарная дата в поясе', () => {
    expect(dateInZone(new Date('2026-10-20T21:30:00Z'), MSK)).toBe('2026-10-21')
  })
})

describe('ввод срока в часовом поясе пользователя', () => {
  it('zonedToIso переводит в UTC по поясу профиля', () => {
    expect(zonedToIso('2026-10-20', '18:30', MSK)).toBe('2026-10-20T15:30:00Z')
    expect(zonedToIso('2026-10-20', '00:15', MSK)).toBe('2026-10-19T21:15:00Z')
    expect(zonedToIso('2026-07-01', '12:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00Z')
    expect(zonedToIso('2026-12-01', '12:00', 'Europe/Berlin')).toBe('2026-12-01T11:00:00Z')
  })

  it('isoToZoned — обратно для полей ввода', () => {
    expect(isoToZoned('2026-10-19T21:15:00Z', MSK)).toEqual({ date: '2026-10-20', time: '00:15' })
  })
})
