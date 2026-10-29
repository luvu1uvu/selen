import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { RoleKey, Space, SpacePerson } from '@/shared/types/api'
import { makeNavSpace, makeSpace, makeUser, navTree, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const me = makeUser({ id: 'me', name: 'Анна', role: 'member' })

const personal = (...roles: RoleKey[]) => ({ roles, added_at: '2026-10-01T00:00:00Z' })
const sources = (...roles: RoleKey[]) => [
  { type: 'personal' as const, group: null, folder: null, roles },
]

const members: SpacePerson[] = [
  {
    user: { id: 'me', name: 'Анна', email: 'anna@selen.test', status: 'active', guest: false },
    personal: personal('admin'),
    sources: sources('admin'),
  },
  {
    user: {
      id: 'u-2',
      name: 'Борис',
      email: 'boris@selen.test',
      status: 'deactivated',
      guest: false,
    },
    personal: personal('editor'),
    sources: sources('editor'),
  },
]

function serve(space: Space) {
  server.use(
    http.get('*/api/v1/spaces', () => HttpResponse.json({ data: [space] })),
    http.get('*/api/v1/navigation', () => HttpResponse.json(navTree([makeNavSpace(space)]))),
    http.get('*/api/v1/spaces/DEV', () => HttpResponse.json({ data: space })),
    http.get('*/api/v1/spaces/DEV/members', () => HttpResponse.json({ data: members })),
  )
}

describe('Страница пространства', () => {
  beforeEach(() => signedInAs(me))

  it('администратор пространства добавляет участника', async () => {
    let body: unknown
    serve(makeSpace())
    server.use(
      http.get('*/api/v1/companies/:company/users/directory', () =>
        HttpResponse.json({
          data: [{ id: 'u-3', name: 'Вера', email: 'vera@selen.test', status: 'active' }],
        }),
      ),
      http.post('*/api/v1/spaces/DEV/members', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: members[1] }, { status: 201 })
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    const deactivatedRow = (await screen.findByText('Борис')).closest('tr')!
    expect(within(deactivatedRow).getByText('Деактивирован')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Добавить участника' }))
    await userEvent.click(await screen.findByRole('button', { name: /Вера/ }))
    const roles = within(screen.getByRole('group', { name: 'Роли' }))
    await userEvent.click(roles.getByRole('button', { name: 'Редактор' }))
    await userEvent.click(roles.getByRole('button', { name: 'Комментатор' }))
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(await screen.findByText('Участник добавлен')).toBeInTheDocument()
    expect(body).toEqual({ user_id: 'u-3', roles: ['commenter'] })
  })

  it('не даёт добавить участника без выбора сотрудника', async () => {
    serve(makeSpace())
    server.use(
      http.get('*/api/v1/companies/:company/users/directory', () =>
        HttpResponse.json({ data: [] }),
      ),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить участника' }))
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(await screen.findByText('Выберите сотрудника')).toBeInTheDocument()
  })

  it('исключает участника после подтверждения', async () => {
    let removed = false
    serve(makeSpace())
    server.use(
      http.delete('*/api/v1/spaces/DEV/members/u-2', () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Исключить Борис' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Исключить' }))

    expect(await screen.findByText('Участник исключён')).toBeInTheDocument()
    expect(removed).toBe(true)
  })

  it('редактор видит участников, но не управляет ими и пространством', async () => {
    serve(
      makeSpace({
        my_role: 'editor',
        permissions: { manage: false, edit_cards: true, view_access_sources: true },
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    expect(await screen.findByText('Борис')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить участника' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Роль Борис')).not.toBeInTheDocument()
  })

  it('чужое или несуществующее пространство — на главную с уведомлением (ADR-0024)', async () => {
    server.use(
      http.get('*/api/v1/spaces/NOPE', () =>
        HttpResponse.json({ message: 'Не найдено.' }, { status: 404 }),
      ),
    )
    const { router } = renderApp('/spaces/NOPE')

    expect(
      await screen.findByText('Нет доступа к пространству или оно не существует'),
    ).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('архивное пространство помечено и доступно только для чтения', async () => {
    serve(
      makeSpace({
        archived_at: '2026-10-10T00:00:00Z',
        permissions: { manage: false, edit_cards: false, view_access_sources: true },
      }),
    )
    renderApp('/spaces/DEV')

    expect(await screen.findByText(/Пространство в архиве/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
  })

  it('главная и сайдбар показывают пространства пользователя', async () => {
    serve(makeSpace())
    renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Дерево' })
    expect(await within(nav).findByRole('link', { name: /Разработка/ })).toHaveAttribute(
      'href',
      '/spaces/DEV',
    )
    expect(screen.getByText('Ваша роль: Администратор')).toBeInTheDocument()
  })

  it('без доступных пространств показывает подсказку', async () => {
    renderApp('/')

    expect(
      await screen.findByText('У вас пока нет доступа ни к одному пространству'),
    ).toBeInTheDocument()
  })

  it('администратор меняет личные роли участника чипами — «только свои карточки» тоже роль', async () => {
    let body: unknown
    serve(makeSpace())
    server.use(
      http.patch('*/api/v1/spaces/DEV/members/u-2', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { ...members[1], personal: personal('editor_own') } })
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить роли Борис' }))
    const dialog = await screen.findByRole('dialog', { name: 'Роли: Борис' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Редактор', pressed: true }))
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Редактор — только свои карточки' }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Роли изменены')).toBeInTheDocument()
    expect(body).toEqual({ roles: ['editor_own'] })
  })

  it('участник видит роли участников («— только свои карточки») без действий', async () => {
    serve(
      makeSpace({
        my_role: 'editor',
        permissions: { manage: false, edit_cards: true, view_access_sources: true },
      }),
    )
    server.use(
      http.get('*/api/v1/spaces/DEV/members', () =>
        HttpResponse.json({
          data: [
            members[0],
            { ...members[1], personal: personal('editor_own'), sources: sources('editor_own') },
          ],
        }),
      ),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Участники' }))
    const row = (await screen.findByText('Борис')).closest('tr')!
    expect(within(row).getByText('Лично: Редактор — только свои карточки')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Изменить роли/ })).not.toBeInTheDocument()
  })
})
