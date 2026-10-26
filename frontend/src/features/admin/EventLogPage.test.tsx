import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Журнал событий', () => {
  it('показывает события с человекочитаемыми названиями', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/events', () =>
        HttpResponse.json({
          data: [
            {
              id: 2,
              event_type: 'user.deactivated',
              occurred_at: '2026-10-12T10:00:00Z',
              actor: { id: 'a', name: 'Анна Админова' },
              subject_type: 'user',
              subject_id: 'u-2',
              payload: {},
              meta: { source: 'http' },
              auth_audit: null,
            },
            {
              id: 1,
              event_type: 'auth.login_failed',
              occurred_at: '2026-10-12T09:00:00Z',
              actor: null,
              subject_type: null,
              subject_id: null,
              payload: { reason: 'invalid_credentials' },
              meta: { source: 'http' },
              auth_audit: { ip: '10.0.0.7', user_agent: 'Firefox' },
            },
          ],
          meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
        }),
      ),
    )
    renderApp('/admin/events')

    expect(
      await screen.findByRole('cell', { name: 'Пользователь деактивирован' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Неудачная попытка входа' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Без входа IP 10.0.0.7' })).toBeInTheDocument()
  })
})
