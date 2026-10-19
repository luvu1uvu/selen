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
    ...overrides,
  }
}

describe('Админка: пространства', () => {
  beforeEach(() => signedInAs(admin))

  it('показывает пространства с администраторами; архивные — по флажку', async () => {
    server.use(
      http.get('*/api/v1/admin/spaces', () =>
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
      http.get('*/api/v1/admin/spaces', () => HttpResponse.json({ data: [] })),
      http.get('*/api/v1/users/directory', () =>
        HttpResponse.json({
          data: [{ id: 'u-a', name: 'Анна', email: 'anna@selen.test', status: 'active' }],
        }),
      ),
      http.post('*/api/v1/admin/spaces', async ({ request }) => {
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
      http.get('*/api/v1/admin/spaces', () => HttpResponse.json({ data: [] })),
      http.post('*/api/v1/admin/spaces', async ({ request }) => {
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
    server.use(http.get('*/api/v1/admin/spaces', () => HttpResponse.json({ data: [] })))
    renderApp('/admin/spaces')

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Разработка')
    await userEvent.type(screen.getByLabelText('Ключ'), 'D1')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(
      await screen.findByText('Только заглавные латинские буквы, от 2 до 10'),
    ).toBeInTheDocument()
  })

  it('назначает роль себе', async () => {
    let request: { url: string; body: unknown } | undefined
    server.use(
      http.get('*/api/v1/admin/spaces', () => HttpResponse.json({ data: [adminSpace()] })),
      http.put('*/api/v1/admin/spaces/space-1/members/:userId', async ({ request: req }) => {
        request = { url: req.url, body: await req.json() }
        return HttpResponse.json({ data: adminSpace({ my_role: 'commenter' }) })
      }),
    )
    renderApp('/admin/spaces')

    await userEvent.click(await screen.findByRole('button', { name: 'Действия с пространством' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Назначить роль' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Назначить себе' }))
    await userEvent.selectOptions(screen.getByLabelText('Роль'), 'commenter')
    await userEvent.click(screen.getByRole('button', { name: 'Назначить' }))

    expect(await screen.findByText('Роль назначена')).toBeInTheDocument()
    expect(request?.url).toMatch(/members\/admin-1$/)
    expect(request?.body).toEqual({ role: 'commenter' })
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
