import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminSpace } from '@/shared/types/api'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })

function adminSpace(overrides: Partial<AdminSpace> = {}): AdminSpace {
  return {
    id: 'space-1',
    key: 'DEV',
    name: 'Разработка',
    description: null,
    icon: null,
    archived_at: null,
    created_at: '2026-10-01T00:00:00Z',
    admins: [{ id: 'u-a', name: 'Анна', status: 'active' }],
    members_count: 3,
    groups_count: 0,
    has_active_admin: true,
    my_role: null,
    node_id: 'n-1',
    ...overrides,
  }
}

describe('Админка: пространства', () => {
  beforeEach(() => signedInAs(admin))

  it('показывает пространства с администраторами; архивные — по флажку', async () => {
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () =>
        HttpResponse.json({
          data: [
            adminSpace(),
            adminSpace({
              id: 'space-2',
              key: 'OLD',
              name: 'Старое',
              archived_at: '2026-01-01T00:00:00Z',
            }),
          ],
        }),
      ),
    )
    renderApp('/admin/spaces')

    const row = (await screen.findByText('Разработка')).closest('tr')!
    expect(within(row).getAllByText('Анна').length).toBeGreaterThan(0)
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('Старое')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Показывать архивные'))
    expect(screen.getByText('Старое')).toBeInTheDocument()
  })

  it('создаёт пространство: ключ в верхнем регистре, выбранные администраторы', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () => HttpResponse.json({ data: [] })),
      http.get('*/api/v1/companies/:company/users/directory', () =>
        HttpResponse.json({
          data: [{ id: 'u-a', name: 'Анна', email: 'anna@selen.test', status: 'active' }],
        }),
      ),
      http.post('*/api/v1/admin/companies/:company/spaces', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: adminSpace() }, { status: 201 })
      }),
    )
    renderApp('/admin/spaces')

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Разработка')
    await userEvent.type(screen.getByLabelText('Ключ'), 'dev')
    await userEvent.click(await screen.findByRole('button', { name: /Анна/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Пространство создано')).toBeInTheDocument()
    expect(body).toEqual({
      name: 'Разработка',
      key: 'DEV',
      description: null,
      icon: null,
      admin_ids: ['u-a'],
    })
  })

  it('без выбранных администраторов admin_ids не отправляется; ошибка вне полей формы — сообщением', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () => HttpResponse.json({ data: [] })),
      http.post('*/api/v1/admin/companies/:company/spaces', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json(
              { message: 'Папка в архиве', errors: { parent_id: ['Папка в архиве'] } },
              { status: 422 },
            )
          : HttpResponse.json({ data: adminSpace() }, { status: 201 })
      }),
    )
    renderApp('/admin/spaces')

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Разработка')
    await userEvent.type(screen.getByLabelText('Ключ'), 'dev')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Папка в архиве')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(await screen.findByText('Пространство создано')).toBeInTheDocument()
    expect(bodies[1]).toEqual({ name: 'Разработка', key: 'DEV', description: null, icon: null })
  })

  it('проверяет формат ключа до отправки', async () => {
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () => HttpResponse.json({ data: [] })),
    )
    renderApp('/admin/spaces')

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Разработка')
    await userEvent.type(screen.getByLabelText('Ключ'), 'D1')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(
      await screen.findByText('Только заглавные латинские буквы, от 2 до 10'),
    ).toBeInTheDocument()
  })

  it('«Доступ…» пространства: выдаёт доступ себе с ролями (П2d-1)', async () => {
    let request: { url: string; body: unknown } | undefined
    const access = {
      node: { id: 'n-1', type: 'space', name: 'Разработка', space: null },
      grants: [],
    }
    server.use(
      http.get('*/api/v1/admin/companies/:company/spaces', () =>
        HttpResponse.json({ data: [adminSpace()] }),
      ),
      http.get('*/api/v1/admin/companies/:company/nav-nodes/n-1/access', () =>
        HttpResponse.json({ data: access }),
      ),
      http.put(
        '*/api/v1/admin/companies/:company/nav-nodes/n-1/access/users/:userId',
        async ({ request: req }) => {
          request = { url: req.url, body: await req.json() }
          return HttpResponse.json({ data: access })
        },
      ),
    )
    renderApp('/admin/spaces')

    await userEvent.click(
      await screen.findByRole('button', { name: /^Действия с пространством «/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Доступ…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Доступ: Разработка' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Себе' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Редактор', pressed: true }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Комментатор' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Выдать доступ' }))

    expect(await screen.findByText('Доступ выдан')).toBeInTheDocument()
    expect(request?.url).toMatch(/access\/users\/admin-1$/)
    expect(request?.body).toEqual({ roles: ['commenter'] })
  })

  it('обычному сотруднику админка недоступна, пункта меню нет', async () => {
    signedInAs(makeUser({ role: 'member' }))
    renderApp('/admin/spaces')

    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать пространство' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Администрирование' })).not.toBeInTheDocument()
    expect(screen.queryByText('Типы карточек')).not.toBeInTheDocument()
  })
})
