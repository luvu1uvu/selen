import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
              auth_audit: {
                ip: '10.0.0.7',
                user_agent:
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
              },
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
    // IP и браузер (П2c-2): коротко, полная строка — в подсказке по фокусу
    const actor = screen.getByText('Без входа', { exact: false }).closest('td')!
    expect(actor).toHaveTextContent('IP 10.0.0.7')
    expect(actor).toHaveTextContent('Firefox 132 · Windows')
    await userEvent.hover(screen.getByText('Firefox 132 · Windows'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Gecko/20100101 Firefox/132.0')
  })

  it('фильтр по человеку: список людей компании, запрос с user_id (П2c-2)', async () => {
    signedInAs(makeUser())
    const requests: (string | null)[] = []
    server.use(
      http.get('*/api/v1/admin/companies/:company/events/people', () =>
        HttpResponse.json({
          data: [
            { id: 'u-1', name: 'Анна Админова' },
            { id: 'u-2', name: 'Борис' },
          ],
        }),
      ),
      http.get('*/api/v1/admin/companies/:company/events', ({ request }) => {
        requests.push(new URL(request.url).searchParams.get('user_id'))
        return HttpResponse.json({
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 50, total: 0 },
        })
      }),
    )
    renderApp('/admin/events')

    const filter = await screen.findByRole('combobox', { name: 'Человек' })
    await screen.findByRole('option', { name: 'Борис' })
    await userEvent.selectOptions(filter, 'u-2')

    await waitFor(() => expect(requests).toContain('u-2'))
    expect(requests[0]).toBeNull()
  })
})
