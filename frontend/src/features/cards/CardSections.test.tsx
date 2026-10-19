import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CardDetail, Label, SpacePerson } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const member = (
  id: string,
  name: string,
  status: SpacePerson['user']['status'] = 'active',
): SpacePerson => ({
  user: { id, name, email: `${id}@selen.test`, status },
  role: 'editor',
  personal: { role: 'editor', own_cards_only: false, added_at: '2026-10-01T00:00:00Z' },
  groups: [],
})

const members: SpacePerson[] = [
  member('u1', 'Борис'),
  member('u2', 'Вера', 'invited'),
  member('u3', 'Глеб', 'deactivated'),
]

const labels: Label[] = [
  { id: 'l-sec', name: 'Безопасность', color: '#ef4444', scope: 'company', archived_at: null },
  {
    id: 'l-old',
    name: 'Старая',
    color: '#64748b',
    scope: 'company',
    archived_at: '2026-10-01T00:00:00Z',
  },
  { id: 'l-front', name: 'Фронтенд', color: '#3b82f6', scope: 'space', archived_at: null },
]

/** Подменить карточку DEV-1 (PATCH применяет поля, как сервер) и записывать изменяющие запросы. */
function serveCard(card: CardDetail) {
  const calls: { method: string; path: string; body: unknown }[] = []
  let current = card
  const record =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const body = method === 'DELETE' ? null : await request.json()
      calls.push({ method, path: new URL(request.url).pathname, body })
      if (method === 'PATCH') current = { ...current, ...(body as Partial<CardDetail>) }
      return HttpResponse.json({ data: current })
    }
  server.use(
    http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: current })),
    http.patch('*/api/v1/cards/DEV-1', record('PATCH')),
    http.post('*/api/v1/cards/DEV-1/participants', record('POST')),
    http.delete('*/api/v1/cards/DEV-1/participants/:user', record('DELETE')),
    http.put('*/api/v1/cards/DEV-1/labels', record('PUT')),
  )
  return calls
}

describe('Карточка: люди, поля, метки', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member', timezone: 'Europe/Moscow' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/cards/DEV-1/history', () => HttpResponse.json(makeCardHistory())),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
      http.get('*/api/v1/spaces/DEV/members', () => HttpResponse.json({ data: members })),
      http.get('*/api/v1/spaces/DEV/labels', () => HttpResponse.json({ data: labels })),
    )
  })

  it('назначает ответственного и участников из участников пространства, кроме деактивированных', async () => {
    const calls = serveCard(
      makeCardDetail({
        participants: [{ id: 'u3', name: 'Глеб', status: 'deactivated', in_space: false }],
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Уже назначенный деактивированный — с пометками
    expect(within(panel).getByText('Деактивирован')).toBeInTheDocument()
    expect(within(panel).getByText('Не в пространстве')).toBeInTheDocument()

    const responsible = within(panel).getByLabelText('Ответственный')
    await within(responsible).findByRole('option', { name: 'Вера' })
    expect(within(responsible).queryByRole('option', { name: 'Глеб' })).not.toBeInTheDocument()
    await userEvent.selectOptions(responsible, 'u2')

    await userEvent.selectOptions(within(panel).getByLabelText('Добавить участника…'), 'u1')
    await userEvent.click(within(panel).getByRole('button', { name: 'Убрать Глеб из участников' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        { method: 'PATCH', path: '/api/v1/cards/DEV-1', body: { responsible_id: 'u2' } },
        { method: 'POST', path: '/api/v1/cards/DEV-1/participants', body: { user_id: 'u1' } },
        { method: 'DELETE', path: '/api/v1/cards/DEV-1/participants/u3', body: null },
      ]),
    )
  })

  it('срок: дата без времени; время — в часовом поясе профиля, на сервер — UTC', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    const date = within(panel).getByLabelText('Дата срока')
    await userEvent.type(date, '2026-10-20')
    await vi.waitFor(() =>
      expect(calls.at(-1)?.body).toEqual({ due_date: '2026-10-20', due_at: null }),
    )

    const time = within(panel).getByLabelText('Время срока (необязательно)')
    await vi.waitFor(() => expect(time).toBeEnabled())
    await userEvent.type(time, '18:30')
    await userEvent.tab()
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ due_at: '2026-10-20T15:30:00Z' }))
  })

  it('«Срочно» и оценка с шагом 0,5 часа', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Срочно' }))
    const estimate = within(panel).getByLabelText('Оценка, ч')
    await userEvent.type(estimate, '0,3')
    await userEvent.tab()
    expect(await within(panel).findByText(/шагом 0,5 часа/)).toBeInTheDocument()

    await userEvent.clear(estimate)
    await userEvent.type(estimate, '2,5')
    await userEvent.tab()

    await vi.waitFor(() =>
      expect(calls.map((call) => call.body)).toEqual([
        { is_urgent: true },
        { estimate_hours: 2.5 },
      ]),
    )
  })

  it('метки: ставит активные, архивную предлагает только если она уже стоит', async () => {
    const calls = serveCard(
      makeCardDetail({ labels: [labels[2]], due_date: '2026-10-01', completed_at: null }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Просроченный срок подсвечен
    expect(within(panel).getAllByText(/Просрочено/).length).toBeGreaterThan(0)

    await userEvent.click(within(panel).getByRole('button', { name: 'Метки' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Общие метки компании')).toBeInTheDocument()
    expect(within(menu).queryByText('Старая')).not.toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Безопасность' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'PUT',
          path: '/api/v1/cards/DEV-1/labels',
          body: { label_ids: ['l-front', 'l-sec'] },
        },
      ]),
    )
  })

  it('без права правки — люди и поля только для чтения', async () => {
    serveCard(
      makeCardDetail({
        permissions: { edit: false, comment: true, restricted: true, delete: false },
        responsible: { id: 'u2', name: 'Вера', status: 'invited', in_space: true },
        estimate_hours: 6,
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByText('Вера')).toBeInTheDocument()
    expect(within(panel).getByText('Приглашён')).toBeInTheDocument()
    expect(within(panel).queryByLabelText('Ответственный')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Метки' })).not.toBeInTheDocument()
    expect(within(panel).getByLabelText('Оценка, ч')).toBeDisabled()
    expect(within(panel).getByLabelText('Оценка, ч')).toHaveValue('6')
  })
})

describe('Фасад карточки на доске', () => {
  it('метки, «Срочно», срок с подсветкой и ответственный', async () => {
    signedInAs(makeUser({ role: 'member', timezone: 'Europe/Moscow' }))
    const board = makeBoardDetail()
    board.cards[0] = {
      ...board.cards[0],
      label_ids: ['l-sec'],
      is_urgent: true,
      due_date: '2026-01-05',
      responsible_id: 'u1',
    }
    board.cards[1] = {
      ...board.cards[1],
      due_date: '2026-01-05',
      completed_at: '2026-01-04T10:00:00Z',
    }
    board.labels = [labels[0]]
    board.people = [{ id: 'u1', name: 'Борис', status: 'active' }]
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })),
      http.get('*/api/v1/spaces', () => HttpResponse.json({ data: [] })),
    )
    renderApp('/boards/board-1')

    const first = await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })
    expect(within(first).getByText('Безопасность')).toBeInTheDocument()
    expect(within(first).getByText('Срочно')).toBeInTheDocument()
    expect(within(first).getByText(/Просрочено: срок 5 янв\./)).toBeInTheDocument()
    expect(within(first).getByRole('img', { name: 'Ответственный: Борис' })).toHaveTextContent('Б')

    const second = screen.getByRole('button', { name: 'Открыть DEV-2: Вторая' })
    expect(within(second).getByText(/Выполнено в срок/)).toBeInTheDocument()
  })
})
