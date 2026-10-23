import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminSpace, AdminUser, Group, UserAccess } from '@/shared/types/api'
import { makeAdminUser, makeUser, NO_USER_PERMISSIONS, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g-1',
    name: 'Analysts',
    description: 'Аналитики',
    system: null,
    archived_at: null,
    created_at: '2026-10-01T00:00:00Z',
    members_count: 1,
    spaces_count: 1,
    members: [
      {
        id: 'u-olga',
        name: 'Ольга',
        email: 'olga@selen.test',
        status: 'active',
        added_at: '2026-10-02T09:00:00Z',
      },
    ],
    spaces: [
      {
        space: { id: 's-ios', key: 'IOS', name: 'iOS', archived_at: null },
        role: 'commenter',
        own_cards_only: false,
      },
    ],
    ...overrides,
  }
}

const adminSpace = (id: string, key: string, name: string): AdminSpace => ({
  id,
  key,
  name,
  description: null,
  icon: null,
  archived_at: null,
  created_at: '2026-10-01T00:00:00Z',
  admins: [],
  members_count: 1,
  groups_count: 0,
  has_active_admin: true,
  my_role: null,
})

describe('Админка: группы', () => {
  beforeEach(() => {
    signedInAs(admin)
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () => HttpResponse.json({ data: [] })),
    )
  })

  it('список групп; архивные — по флажку; создание открывает страницу группы', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups', () =>
        HttpResponse.json({
          data: [
            makeGroup(),
            makeGroup({ id: 'g-old', name: 'Old', archived_at: '2026-10-05T00:00:00Z' }),
          ],
        }),
      ),
      http.post('*/api/v1/admin/companies/:company/groups', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          { data: makeGroup({ id: 'g-new', name: 'Contractors' }) },
          { status: 201 },
        )
      }),
      http.get('*/api/v1/admin/companies/:company/groups/g-new', () =>
        HttpResponse.json({
          data: makeGroup({ id: 'g-new', name: 'Contractors', members: [], spaces: [] }),
        }),
      ),
    )
    renderApp('/admin/groups')

    expect(await screen.findByRole('link', { name: 'Analysts' })).toHaveAttribute(
      'href',
      '/admin/groups/g-1',
    )
    expect(screen.queryByText('Old')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Показывать архивные'))
    expect(screen.getByText('Old')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать группу' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Contractors')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('heading', { name: 'Contractors' })).toBeInTheDocument()
    expect(body).toEqual({ name: 'Contractors', description: null })
  })

  it('страница группы: добавляет человека, выдаёт доступ к пространству и меняет роль', async () => {
    const requests: { url: string; body: unknown }[] = []
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups/g-1', () =>
        HttpResponse.json({ data: makeGroup() }),
      ),
      http.get('*/api/v1/companies/:company/users/directory', () =>
        HttpResponse.json({
          data: [{ id: 'u-ivan', name: 'Иван', email: 'ivan@selen.test', status: 'active' }],
        }),
      ),
      http.get('*/api/v1/admin/companies/:company/spaces', () =>
        HttpResponse.json({
          data: [adminSpace('s-ios', 'IOS', 'iOS'), adminSpace('s-and', 'AND', 'Android')],
        }),
      ),
      http.post('*/api/v1/admin/companies/:company/groups/g-1/members', async ({ request }) => {
        requests.push({ url: 'members', body: await request.json() })
        return HttpResponse.json({ data: makeGroup() })
      }),
      http.put(
        '*/api/v1/admin/companies/:company/groups/g-1/spaces/:spaceId',
        async ({ request, params }) => {
          requests.push({ url: `spaces/${String(params.spaceId)}`, body: await request.json() })
          return HttpResponse.json({ data: makeGroup() })
        },
      ),
    )
    renderApp('/admin/groups/g-1')

    expect(await screen.findByRole('heading', { name: 'Analysts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ольга' })).toHaveAttribute(
      'href',
      '/admin/users/u-olga',
    )

    await userEvent.type(screen.getByLabelText('Добавить в группу'), 'Ив')
    await userEvent.click(await screen.findByRole('button', { name: /Иван/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(await screen.findByText('Иван добавлен(а) в группу')).toBeInTheDocument()

    // Уже выданный доступ (iOS) в списке выбора не предлагается
    const spaceSelect = screen.getByLabelText('Пространство')
    expect(within(spaceSelect).queryByRole('option', { name: 'iOS (IOS)' })).not.toBeInTheDocument()
    await userEvent.selectOptions(spaceSelect, 's-and')
    await userEvent.click(screen.getByRole('button', { name: 'Выдать доступ' }))
    expect(await screen.findByText('Доступ выдан')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Роль группы в iOS'), 'editor')
    expect(await screen.findByText('Доступ изменён')).toBeInTheDocument()

    expect(requests).toEqual([
      { url: 'members', body: { user_id: 'u-ivan' } },
      { url: 'spaces/s-and', body: { role: 'commenter', own_cards_only: false } },
      { url: 'spaces/s-ios', body: { role: 'editor', own_cards_only: false } },
    ])
  })

  it('исключает человека из группы после подтверждения', async () => {
    let removed = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups/g-1', () =>
        HttpResponse.json({ data: makeGroup() }),
      ),
      http.delete('*/api/v1/admin/companies/:company/groups/g-1/members/u-olga', () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/admin/groups/g-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Исключить Ольга из группы' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/со следующего запроса/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Исключить' }))

    expect(await screen.findByText('Исключён(а) из группы')).toBeInTheDocument()
    expect(removed).toBe(true)
  })

  it('архивная группа — только для чтения, её можно восстановить', async () => {
    let restored = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups/g-1', () =>
        HttpResponse.json({ data: makeGroup({ archived_at: '2026-10-05T00:00:00Z' }) }),
      ),
      http.post('*/api/v1/admin/companies/:company/groups/g-1/restore', () => {
        restored = true
        return HttpResponse.json({ data: makeGroup() })
      }),
    )
    renderApp('/admin/groups/g-1')

    expect(await screen.findByText(/Архивная группа доступа не даёт/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Добавить в группу')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Восстановить' }))

    expect(await screen.findByText('Группа восстановлена')).toBeInTheDocument()
    expect(restored).toBe(true)
  })
})

describe('Админка: доступ пользователя', () => {
  beforeEach(() => signedInAs(admin))

  it('показывает итог и источники по каждому пространству, включая недействующие', async () => {
    const access: UserAccess = {
      user: {
        id: 'u-olga',
        name: 'Ольга',
        email: 'olga@selen.test',
        role: 'member',
        status: 'active',
      },
      groups: [
        { id: 'g-1', name: 'Analysts', archived_at: null },
        { id: 'g-old', name: 'Old', archived_at: '2026-10-05T00:00:00Z' },
      ],
      spaces: [
        {
          space: { id: 's-back', key: 'BACK', name: 'Backend', archived_at: null },
          has_access: true,
          role: 'editor',
          sees_all_cards: true,
          sources: [
            {
              type: 'personal',
              group: null,
              role: 'editor',
              own_cards_only: false,
              inactive_reason: null,
            },
            {
              type: 'group',
              group: { id: 'g-1', name: 'Analysts' },
              role: 'commenter',
              own_cards_only: false,
              inactive_reason: null,
            },
          ],
        },
        {
          space: { id: 's-mgmt', key: 'MGMT', name: 'Management', archived_at: null },
          has_access: false,
          role: null,
          sees_all_cards: false,
          sources: [
            {
              type: 'group',
              group: { id: 'g-old', name: 'Old' },
              role: 'admin',
              own_cards_only: false,
              inactive_reason: 'group_archived',
            },
          ],
        },
      ],
    }
    server.use(
      http.get('*/api/v1/admin/companies/:company/users/u-olga/access', () =>
        HttpResponse.json({ data: access }),
      ),
    )
    renderApp('/admin/users/u-olga')

    expect(await screen.findByRole('heading', { name: /Ольга/ })).toBeInTheDocument()
    expect(screen.getByText('Old (в архиве)')).toBeInTheDocument()

    const backend = screen.getByText('Backend').closest('tr')!
    expect(within(backend).getByText('Редактор')).toBeInTheDocument()
    expect(within(backend).getByText('Видит все карточки')).toBeInTheDocument()
    expect(within(backend).getByText('Лично: Редактор')).toBeInTheDocument()
    expect(within(backend).getByText('Группа «Analysts»: Комментатор')).toBeInTheDocument()

    const mgmt = screen.getByText('Management').closest('tr')!
    expect(within(mgmt).getByText('Нет доступа')).toBeInTheDocument()
    expect(within(mgmt).getByText('— группа в архиве')).toBeInTheDocument()
  })
})

describe('Админка: деактивация последнего администратора', () => {
  beforeEach(() => signedInAs(admin))

  it('предупреждает о пространствах без администратора, даёт назначить замену и не блокирует', async () => {
    const anna = makeAdminUser({ id: 'u-anna', name: 'Анна', email: 'anna@selen.test' })
    let deactivated = false
    let assigned: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json({
          data: [
            makeAdminUser({ ...admin, permissions: NO_USER_PERMISSIONS }),
            anna,
          ] satisfies AdminUser[],
          meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 },
        }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/u-anna/deactivation-impact', () =>
        HttpResponse.json({
          data: {
            last_admin_spaces: [{ id: 's-dev', key: 'DEV', name: 'Dev', archived_at: null }],
          },
        }),
      ),
      http.get('*/api/v1/companies/:company/users/directory', () =>
        HttpResponse.json({
          data: [{ id: 'u-boris', name: 'Борис', email: 'boris@selen.test', status: 'active' }],
        }),
      ),
      http.put(
        '*/api/v1/admin/companies/:company/spaces/s-dev/members/u-boris',
        async ({ request }) => {
          assigned = await request.json()
          return HttpResponse.json({ data: adminSpace('s-dev', 'DEV', 'Dev') })
        },
      ),
      http.post('*/api/v1/admin/companies/:company/users/u-anna/deactivate', () => {
        deactivated = true
        return HttpResponse.json({ data: { ...anna, status: 'deactivated' } })
      }),
    )
    renderApp('/admin/users')

    const row = (await screen.findByText('Анна')).closest('tr')!
    await userEvent.click(
      within(row).getByRole('button', { name: 'Действия с пользователем «Анна»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Деактивировать' }))

    expect(
      await screen.findByText('1 пространство останется без администратора'),
    ).toBeInTheDocument()
    expect(screen.getByText('Dev (DEV)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Назначить администратора' }))
    await userEvent.click(await screen.findByRole('button', { name: /Борис/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Назначить' }))
    expect(await screen.findByText('Роль назначена')).toBeInTheDocument()
    expect(assigned).toEqual({ role: 'admin' })

    await userEvent.click(await screen.findByRole('button', { name: 'Деактивировать' }))
    expect(await screen.findByText('Пользователь деактивирован')).toBeInTheDocument()
    expect(deactivated).toBe(true)
  })
})
