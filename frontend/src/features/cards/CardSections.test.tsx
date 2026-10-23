import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
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

  it('«Снять ответственного» — первым пунктом, над списком людей (U-13 UX-ревью UI-1a)', async () => {
    const calls = serveCard(
      makeCardDetail({ responsible: { id: 'u2', name: 'Вера', status: 'active', in_space: true } }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('button', { name: /Вера/ }))
    const list = await screen.findByRole('listbox')
    await within(list).findByRole('option', { name: 'Борис' })
    const options = within(list).getAllByRole('option')
    expect(options[0]).toHaveTextContent('Снять ответственного')
    await userEvent.click(options[0])
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ responsible_id: null }))
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

    // Ответственный — из списка с поиском; деактивированного там нет
    await userEvent.click(within(panel).getByRole('button', { name: 'Назначить' }))
    const responsible = await screen.findByRole('listbox')
    expect(await within(responsible).findByRole('option', { name: 'Вера' })).toBeInTheDocument()
    expect(within(responsible).queryByRole('option', { name: /Глеб/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox', { name: 'Выбрать ответственного' }), 'вер')
    expect(within(responsible).queryByRole('option', { name: 'Борис' })).not.toBeInTheDocument()
    await userEvent.click(within(responsible).getByRole('option', { name: 'Вера' }))
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    // Участники: список не закрывается после выбора; уже назначенный — с галочкой; Esc закрывает только список
    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить участников' }))
    const participants = await screen.findByRole('listbox')
    expect(
      await within(participants).findByRole('option', { name: 'Глеб — выбран' }),
    ).toBeInTheDocument()
    await userEvent.click(within(participants).getByRole('option', { name: 'Борис' }))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Убрать Глеб из участников' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        { method: 'PATCH', path: '/api/v1/cards/DEV-1', body: { responsible_id: 'u2' } },
        { method: 'POST', path: '/api/v1/cards/DEV-1/participants', body: { user_id: 'u1' } },
        { method: 'DELETE', path: '/api/v1/cards/DEV-1/participants/u3', body: null },
      ]),
    )
  })

  it('заказчик — в строке под названием, меняется выбором из списка', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByText('Заказчик')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Борис — заказчик' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Вера' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        { method: 'PATCH', path: '/api/v1/cards/DEV-1', body: { customer_id: 'u2' } },
      ]),
    )
  })

  it('срок: дата без времени; время — в часовом поясе профиля, на сервер — UTC', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Срока нет — строки нет; добавить — через «+» (LATER-97)
    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить в карточку' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Срок' }))
    const date = await screen.findByLabelText('Дата срока')
    await userEvent.type(date, '2026-10-20')
    await vi.waitFor(() =>
      expect(calls.at(-1)?.body).toEqual({ due_date: '2026-10-20', due_at: null }),
    )

    const time = screen.getByLabelText('Время срока (необязательно)')
    await vi.waitFor(() => expect(time).toBeEnabled())
    await userEvent.type(time, '18:30')
    await userEvent.tab()
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ due_at: '2026-10-20T15:30:00Z' }))
  })

  it('«Срочно» и план с шагом 0,5 часа', async () => {
    const calls = serveCard(makeCardDetail({ estimate_hours: 1 }))
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Срочно' }))
    const estimate = within(panel).getByLabelText('План, ч')
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

  it('«План, ч», пока не задан, скрыт — добавляется через «+» → «Основное», как срок (решение PM 22.10)', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')
    const section = within(panel).getByRole('region', { name: 'Основные параметры' })
    expect(within(section).queryByLabelText('План, ч')).not.toBeInTheDocument()
    // «Срочно» видно всегда (решение PM 22.10)
    expect(within(section).getByRole('checkbox', { name: 'Срочно' })).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить в карточку' }))
    const main = within(await screen.findByRole('group', { name: 'Основное' }))
    await userEvent.click(main.getByRole('menuitem', { name: 'План, ч' }))
    const estimate = await within(section).findByLabelText('План, ч')
    await vi.waitFor(() => expect(estimate).toHaveFocus())
    // Неверное значение — строка остаётся, с введённым текстом и ошибкой; на сервер ничего не уходит
    await userEvent.type(estimate, '1,3{Enter}')
    expect(await within(section).findByText(/шагом 0,5 часа/)).toBeInTheDocument()
    expect(within(section).getByLabelText('План, ч')).toHaveValue('1,3')
    expect(calls).toEqual([])

    await userEvent.clear(within(section).getByLabelText('План, ч'))
    await userEvent.type(within(section).getByLabelText('План, ч'), '3{Enter}')
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ estimate_hours: 3 }))
    expect(within(section).getByLabelText('План, ч')).toHaveValue('3')

    // Так и не задали — строка пропадает (Esc после «+» — фокус снова на «+», U-5 UX-ревью пачки UX-2 — ниже)
    await userEvent.clear(within(section).getByLabelText('План, ч'))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ estimate_hours: null }))
    await vi.waitFor(() =>
      expect(within(section).queryByLabelText('План, ч')).not.toBeInTheDocument(),
    )
  })

  it('«План, ч» через «+» и Esc — строки нет, фокус снова на «+» (U-5 UX-ревью пачки UX-2)', async () => {
    serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')
    const section = within(panel).getByRole('region', { name: 'Основные параметры' })
    const add = within(panel).getByRole('button', { name: 'Добавить в карточку' })

    await userEvent.click(add)
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'Основное' })).getByRole('menuitem', {
        name: 'План, ч',
      }),
    )
    const estimate = await within(section).findByLabelText('План, ч')
    await vi.waitFor(() => expect(estimate).toHaveFocus())
    await userEvent.keyboard('{Escape}')

    await vi.waitFor(() => expect(within(section).queryByLabelText('План, ч')).toBeNull())
    await vi.waitFor(() => expect(add).toHaveFocus())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('метки: ставит активные, архивную предлагает только если она уже стоит', async () => {
    const calls = serveCard(
      makeCardDetail({ labels: [labels[2]], due_date: '2026-10-01', completed_at: null }),
    )
    const success = vi.spyOn(toast, 'success')
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Просроченный срок подсвечен
    expect(within(panel).getAllByText(/Просрочено/).length).toBeGreaterThan(0)

    await userEvent.click(within(panel).getByRole('button', { name: 'Изменить метки' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Общие метки компании')).toBeInTheDocument()
    expect(within(menu).queryByText('Старая')).not.toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Безопасность' }))
    // Как у остальных полей — уведомление «Сохранено» (LATER-93)
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Сохранено'))
    success.mockRestore()

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

  it('«Основные параметры» — строки «поле — значение» по порядку; тип меняется из списка', async () => {
    const calls = serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    const section = within(panel).getByRole('region', { name: 'Основные параметры' })
    expect(
      within(section)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Расположение', 'Тип', 'Ответственный', 'Участники', 'Срочно'])
    expect(within(section).getByText('Продукт / To Do (Основная)')).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'Задача — тип карточки' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Баг' }))
    await vi.waitFor(() => expect(calls.at(-1)?.body).toEqual({ card_type_id: 'bug' }))
  })

  it('без права правки — люди и поля только для чтения', async () => {
    serveCard(
      makeCardDetail({
        permissions: { edit: false, comment: true, restricted: true, delete: false },
        responsible: { id: 'u2', name: 'Вера', status: 'invited', in_space: true },
        estimate_hours: 6.5,
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByText('Вера')).toBeInTheDocument()
    expect(within(panel).getByText('Приглашён')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Назначить' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Вера/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Изменить метки' })).not.toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: 'Добавить участников' }),
    ).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('План, ч')).not.toBeInTheDocument()
    expect(within(panel).getByText('6,5')).toBeInTheDocument()
    // «Срочно» у читателя — текстом, а не недоступным флажком (V-5)
    const section = within(panel).getByRole('region', { name: 'Основные параметры' })
    expect(within(section).queryByRole('checkbox', { name: 'Срочно' })).not.toBeInTheDocument()
    const urgent = within(section).getByText('Срочно').closest('div')!
    expect(urgent).toHaveTextContent('СрочноНет')
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
