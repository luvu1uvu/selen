import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Space, SpaceGroupGrant, SpacePerson } from '@/shared/types/api'
import { makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const me = makeUser({ id: 'me', name: 'Анна', role: 'member' })

const people: SpacePerson[] = [
  {
    user: { id: 'me', name: 'Анна', email: 'anna@selen.test', status: 'active', guest: false },
    role: 'admin',
    personal: { role: 'admin', own_cards_only: false, added_at: '2026-10-01T00:00:00Z' },
    groups: [],
  },
  {
    user: { id: 'u-olga', name: 'Ольга', email: 'olga@selen.test', status: 'active', guest: false },
    role: 'editor',
    personal: { role: 'editor', own_cards_only: false, added_at: '2026-10-01T00:00:00Z' },
    groups: [{ id: 'g-an', name: 'Analysts', role: 'commenter', own_cards_only: false }],
  },
  {
    user: { id: 'u-petr', name: 'Пётр', email: 'petr@selen.test', status: 'active', guest: false },
    role: 'editor',
    personal: null,
    groups: [{ id: 'g-co', name: 'Contractors', role: 'editor', own_cards_only: true }],
  },
]

const grants: SpaceGroupGrant[] = [
  {
    group: {
      id: 'g-an',
      name: 'Analysts',
      description: 'Аналитики',
      system: null,
      archived_at: null,
      members_count: 3,
    },
    role: 'commenter',
    own_cards_only: false,
    added_at: '2026-10-01T00:00:00Z',
  },
]

function serve(space: Space, data: SpacePerson[] = people) {
  server.use(
    http.get('*/api/v1/spaces', () => HttpResponse.json({ data: [space] })),
    http.get('*/api/v1/spaces/DEV', () => HttpResponse.json({ data: space })),
    http.get('*/api/v1/spaces/DEV/members', () => HttpResponse.json({ data })),
    http.get('*/api/v1/spaces/DEV/groups', () => HttpResponse.json({ data: grants })),
    http.get('*/api/v1/companies/:company/groups/directory', () =>
      HttpResponse.json({
        data: [
          { id: 'g-an', name: 'Analysts', description: null, members_count: 3 },
          { id: 'g-co', name: 'Contractors', description: null, members_count: 2 },
        ],
      }),
    ),
  )
}

async function openMembers() {
  renderApp('/spaces/DEV')
  await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
}

describe('Участники пространства: люди и группы', () => {
  beforeEach(() => signedInAs(me))

  it('у человека видно, откуда доступ: лично и через какие группы', async () => {
    serve(makeSpace())
    await openMembers()

    const olga = within(await screen.findByRole('list', { name: 'Источники доступа Ольга' }))
    expect(olga.getByText('Лично: Редактор')).toBeInTheDocument()
    expect(olga.getByText('Analysts: Комментатор')).toBeInTheDocument()
    const petr = within(screen.getByRole('list', { name: 'Источники доступа Пётр' }))
    expect(petr.getByText('Contractors: Редактор · Только свои карточки')).toBeInTheDocument()
    // Только через группу: личной роли нет, исключать нечего — можно добавить лично
    const petrRow = screen.getByText('Пётр').closest('tr')!
    expect(within(petrRow).getByText('Только через группы')).toBeInTheDocument()
    expect(
      within(petrRow).queryByRole('button', { name: 'Исключить Пётр' }),
    ).not.toBeInTheDocument()
  })

  it('гостю люди компании-хозяина — без email, группы — «группа» без названия (решение PM 28.10)', async () => {
    serve(makeSpace(), [
      {
        user: { id: 'me', name: 'Анна', email: 'anna@selen.test', status: 'active', guest: true },
        role: 'commenter',
        personal: { role: 'commenter', own_cards_only: false, added_at: '2026-10-01T00:00:00Z' },
        groups: [],
      },
      {
        user: { id: 'u-olga', name: 'Ольга', email: null, status: 'active', guest: false },
        role: 'editor',
        personal: { role: 'editor', own_cards_only: false, added_at: '2026-10-01T00:00:00Z' },
        groups: [{ id: 'g-an', name: null, role: 'commenter', own_cards_only: false }],
      },
    ])
    await openMembers()

    const olga = within(await screen.findByRole('list', { name: 'Источники доступа Ольга' }))
    expect(olga.getByText('группа: Комментатор')).toBeInTheDocument()
    expect(screen.queryByText('olga@selen.test')).toBeNull()
    expect(screen.getByText('anna@selen.test')).toBeInTheDocument()
  })

  it('человека с доступом через группу можно добавить лично', async () => {
    let body: unknown
    serve(makeSpace())
    server.use(
      http.post('*/api/v1/spaces/DEV/members', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: people[2] }, { status: 201 })
      }),
    )
    await openMembers()

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить Пётр лично' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('petr@selen.test')).toBeInTheDocument()
    await userEvent.selectOptions(within(dialog).getByLabelText('Роль'), 'commenter')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    expect(await screen.findByText('Участник добавлен')).toBeInTheDocument()
    expect(body).toEqual({ user_id: 'u-petr', role: 'commenter' })
  })

  it('при исключении человека с группами предупреждает, что доступ через группы останется', async () => {
    serve(makeSpace())
    await openMembers()

    await userEvent.click(await screen.findByRole('button', { name: 'Исключить Ольга' }))
    expect(await screen.findByText(/Доступ через группы сохранится/)).toBeInTheDocument()
  })

  it('администратор выдаёт доступ группе, меняет роль и отзывает', async () => {
    const requests: { method: string; body: unknown }[] = []
    serve(makeSpace())
    server.use(
      http.post('*/api/v1/spaces/DEV/groups', async ({ request }) => {
        requests.push({ method: 'POST', body: await request.json() })
        return HttpResponse.json({ data: grants[0] }, { status: 201 })
      }),
      http.patch('*/api/v1/spaces/DEV/groups/g-an', async ({ request }) => {
        requests.push({ method: 'PATCH', body: await request.json() })
        return HttpResponse.json({ data: grants[0] })
      }),
      http.delete('*/api/v1/spaces/DEV/groups/g-an', () => {
        requests.push({ method: 'DELETE', body: null })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await openMembers()
    await userEvent.click(screen.getByRole('tab', { name: 'Группы' }))

    expect(await screen.findByText('3 человека · Аналитики')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Добавить группу' }))
    const dialog = await screen.findByRole('dialog')
    // Уже добавленная группа в списке не предлагается
    const select = within(dialog).getByLabelText('Группа')
    expect(within(select).queryByRole('option', { name: /Analysts/ })).not.toBeInTheDocument()
    await userEvent.selectOptions(select, 'g-co')
    await userEvent.selectOptions(within(dialog).getByLabelText('Роль'), 'editor')
    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Выдать доступ' }))
    expect(await screen.findByText('Группе выдан доступ')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Роль группы Analysts'), 'editor')
    expect(await screen.findByText('Роль группы изменена')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Убрать группу Analysts' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Убрать' }),
    )
    expect(await screen.findByText('Доступ группы отозван')).toBeInTheDocument()

    expect(requests).toEqual([
      { method: 'POST', body: { group_id: 'g-co', role: 'editor', own_cards_only: true } },
      { method: 'PATCH', body: { role: 'editor' } },
      { method: 'DELETE', body: null },
    ])
  })

  it('не администратор видит группы без управления', async () => {
    serve(
      makeSpace({
        my_role: 'editor',
        permissions: { manage: false, edit_cards: true, view_access_sources: true },
      }),
    )
    await openMembers()
    await userEvent.click(screen.getByRole('tab', { name: 'Группы' }))

    expect(await screen.findByText('Analysts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить группу' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Роль группы Analysts')).not.toBeInTheDocument()
  })

  it('пользователь только со «своими карточками» видит людей без источников и без вкладки «Группы»', async () => {
    serve(
      makeSpace({
        my_role: 'editor',
        permissions: { manage: false, edit_cards: true, view_access_sources: false },
      }),
      people.map((person) => ({ user: person.user })),
    )
    await openMembers()

    expect(await screen.findByText('Пётр')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Группы' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Analysts|Contractors|Лично/)).not.toBeInTheDocument()
  })
})
