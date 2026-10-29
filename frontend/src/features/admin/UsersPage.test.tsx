import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminUser } from '@/shared/types/api'
import {
  makeAdminUser,
  makeUser,
  NO_USER_PERMISSIONS,
  server,
  signedInAs,
  TEST_COMPANY_ID,
} from '@/test/server'
import { renderApp } from '@/test/render'

/** Адреса админки компании тестов (ADR-0024). */
const ADMIN = `/admin/companies/${TEST_COMPANY_ID}`

const owner = makeUser({
  id: 'owner-1',
  name: 'Ольга Владелец',
  email: 'owner@selen.test',
  role: 'owner',
})
const admin = makeUser({ id: 'admin-1', name: 'Анна Админова' })

function page(users: AdminUser[]) {
  return { data: users, meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length } }
}

/** Строка «самого себя»: сервер не даёт никаких действий. */
const self = (user: typeof admin) => makeAdminUser({ ...user, permissions: NO_USER_PERMISSIONS })

describe('Админка пользователей', () => {
  beforeEach(() => signedInAs(owner))

  it('отличает отозванное приглашение от деактивации', async () => {
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          page([
            self(owner),
            makeAdminUser({
              id: 'u-2',
              name: 'Отозванный',
              email: 'revoked@selen.test',
              role: 'member',
              status: 'deactivated',
              invitation: { id: 'inv-2', state: 'revoked', expires_at: '2026-10-15T00:00:00Z' },
            }),
            makeAdminUser({
              id: 'u-3',
              name: 'Уволенный',
              email: 'gone@selen.test',
              role: 'member',
              status: 'deactivated',
              invitation: null,
            }),
          ]),
        ),
      ),
    )
    renderApp('/admin/users')

    const revokedRow = (await screen.findByText('Отозванный')).closest('tr')!
    const goneRow = screen.getByText('Уволенный').closest('tr')!
    expect(within(revokedRow).getByText('Приглашение отозвано')).toBeInTheDocument()
    expect(within(goneRow).getByText('Деактивирован')).toBeInTheDocument()
  })

  it('Владелец приглашает администратора через диалог', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(owner)])),
      ),
      http.post('*/api/v1/admin/companies/:company/invitations', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            data: {
              result: 'invited',
              user: { id: 'u-new', name: 'Борис Новиков' },
              invitation: null,
            },
          },
          { status: 201 },
        )
      }),
    )
    renderApp('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    await userEvent.type(screen.getByLabelText('Имя и фамилия'), 'Борис Новиков')
    await userEvent.type(screen.getByLabelText('Рабочий email'), 'boris@selen.test')
    await userEvent.selectOptions(screen.getByLabelText('Роль'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

    expect(
      await screen.findByText('Приглашение отправлено на boris@selen.test'),
    ).toBeInTheDocument()
    expect(body).toEqual({
      name: 'Борис Новиков',
      email: 'boris@selen.test',
      role: 'admin',
      grants: [],
    })
  })

  it('существующий сотрудник другой компании — «Сотрудник добавлен»; сразу доступ к папке с ролями (П2c, П2d-1)', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(owner)])),
      ),
      http.get('*/api/v1/admin/companies/:company/grantable-nodes', () =>
        HttpResponse.json({
          data: [
            { id: 'n-product', type: 'folder', name: 'Продукт', depth: 1, space: null },
            {
              id: 'n-dev',
              type: 'space',
              name: 'Разработка',
              depth: 2,
              space: { id: 's-dev', key: 'DEV' },
            },
          ],
        }),
      ),
      http.post('*/api/v1/admin/companies/:company/invitations', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            data: {
              result: 'added',
              user: { id: 'u-oleg', name: 'Олег Никитин' },
              invitation: null,
            },
          },
          { status: 201 },
        )
      }),
    )
    renderApp('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    await userEvent.type(screen.getByLabelText('Имя и фамилия'), 'Олег')
    await userEvent.type(screen.getByLabelText('Рабочий email'), 'oleg@selen.test')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Добавить папку или пространство' }),
    )
    // Первая строка — папка «Продукт» (доступ действует на всё внутри); роли — чипами, можно несколько
    expect(screen.getByRole('combobox', { name: 'Папка или пространство' })).toHaveValue(
      'n-product',
    )
    const roles = within(screen.getByRole('group', { name: 'Роли в «Папка «Продукт»»' }))
    await userEvent.click(roles.getByRole('button', { name: 'Комментатор' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

    expect(await screen.findByText('Сотрудник добавлен: Олег Никитин')).toBeInTheDocument()
    expect(body).toMatchObject({
      email: 'oleg@selen.test',
      grants: [{ node_id: 'n-product', roles: ['editor', 'commenter'] }],
    })
  })

  it('обычный администратор приглашает только участника', async () => {
    signedInAs(admin)
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(admin)])),
      ),
    )
    renderApp('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    const role = screen.getByLabelText('Роль')
    expect(
      within(role)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Участник'])
    expect(screen.getByText('Назначить администратора может только Владелец.')).toBeInTheDocument()
  })

  it('показывает ошибку валидации с сервера в диалоге приглашения', async () => {
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(owner)])),
      ),
      http.post('*/api/v1/admin/companies/:company/invitations', () =>
        HttpResponse.json(
          { message: 'x', errors: { email: ['Этот email уже используется в Selen.'] } },
          { status: 422 },
        ),
      ),
    )
    renderApp('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    await userEvent.type(screen.getByLabelText('Имя и фамилия'), 'Дубль')
    await userEvent.type(screen.getByLabelText('Рабочий email'), 'admin@selen.test')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

    expect(await screen.findByText('Этот email уже используется в Selen.')).toBeInTheDocument()
  })

  it('ошибку выдачи доступа (роли, «не останется управляющего») показывает в окне приглашения, а не молча', async () => {
    const message =
      'Нельзя: в пространствах «Разработка» не останется никого, кто лично управляет доступом.'
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(owner)])),
      ),
      http.post('*/api/v1/admin/companies/:company/invitations', () =>
        HttpResponse.json({ message: 'x', errors: { roles: [message] } }, { status: 422 }),
      ),
    )
    renderApp('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    await userEvent.type(screen.getByLabelText('Имя и фамилия'), 'Вера')
    await userEvent.type(screen.getByLabelText('Рабочий email'), 'vera@selen.test')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('деактивирует пользователя после подтверждения', async () => {
    let deactivated = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          page([self(owner), makeAdminUser({ id: 'u-2', name: 'Борис', role: 'member' })]),
        ),
      ),
      http.get('*/api/v1/admin/companies/:company/users/u-2/deactivation-impact', () =>
        HttpResponse.json({ data: { last_admin_spaces: [] } }),
      ),
      http.post('*/api/v1/admin/companies/:company/users/u-2/deactivate', () => {
        deactivated = true
        return HttpResponse.json({ data: makeAdminUser({ id: 'u-2', status: 'deactivated' }) })
      }),
    )
    renderApp('/admin/users')

    const row = (await screen.findByText('Борис')).closest('tr')!
    await userEvent.click(
      within(row).getByRole('button', { name: 'Действия с пользователем «Борис»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Деактивировать…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Деактивировать' }),
    )

    expect(await screen.findByText('Пользователь деактивирован')).toBeInTheDocument()
    expect(deactivated).toBe(true)
  })

  it('не показывает меню действий для самого себя', async () => {
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(page([self(owner)])),
      ),
    )
    renderApp('/admin/users')

    const row = (await screen.findAllByText('owner@selen.test'))[0].closest('tr')!
    expect(within(row).getByText('вы')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^Действия с пользователем/ })).toBeNull()
  })

  it('бейдж «Владелец»; обычному администратору нет действий с Владельцем и администраторами', async () => {
    signedInAs(admin)
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          page([
            makeAdminUser({ ...owner, permissions: NO_USER_PERMISSIONS }),
            self(admin),
            makeAdminUser({
              id: 'u-admin',
              name: 'Другой Админ',
              email: 'other@selen.test',
              permissions: NO_USER_PERMISSIONS,
            }),
            makeAdminUser({
              id: 'u-member',
              name: 'Борис',
              email: 'boris@selen.test',
              role: 'member',
              permissions: {
                ...NO_USER_PERMISSIONS,
                deactivate: true,
                reactivate: true,
                manage_invitation: true,
              },
            }),
          ]),
        ),
      ),
    )
    renderApp('/admin/users')

    const ownerRow = (await screen.findByText('Ольга Владелец')).closest('tr')!
    expect(within(ownerRow).getByText('Владелец')).toBeInTheDocument()
    // Ключ вместо «⋯»: подсказка Tooltip по наведению и по фокусу, не title; почему нет меню — в ней же (LATER-85)
    const user = userEvent.setup()
    for (const name of ['Ольга Владелец', 'Другой Админ']) {
      const row = screen.getByText(name).closest('tr')!
      expect(within(row).queryByRole('button', { name: /^Действия с пользователем/ })).toBeNull()
      const key = within(row).getByRole('link', { name: 'Доступ к пространствам' })
      expect(key).not.toHaveAttribute('title')
      await user.hover(key)
      const hint = await screen.findByRole('tooltip')
      expect(hint).toHaveTextContent('Доступ к пространствам')
      expect(hint).toHaveTextContent(
        'Действия с администраторами и Владельцем доступны только Владельцу',
      )
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    }
    // Своя строка: у ключа своя подсказка, без причины
    const myRow = within(screen.getByRole('table')).getByText(admin.name).closest('tr')!
    const myKey = within(myRow).getByRole('link', {
      name: 'Доступ к пространствам',
    })
    act(() => myKey.focus())
    const myHint = await screen.findByRole('tooltip')
    expect(myHint).toHaveTextContent('Доступ к пространствам')
    expect(myHint).not.toHaveTextContent('доступны только Владельцу')
    await user.keyboard('{Escape}')

    const memberRow = screen.getByText('Борис').closest('tr')!
    await userEvent.click(
      within(memberRow).getByRole('button', { name: 'Действия с пользователем «Борис»' }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Деактивировать…' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Сделать администратором' })).toBeNull()
    // Передать владение может только Владелец
    expect(screen.queryByRole('button', { name: 'Передать владение' })).toBeNull()
  })

  it('Владелец назначает администратора из меню', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          page([self(owner), makeAdminUser({ id: 'u-2', name: 'Борис', role: 'member' })]),
        ),
      ),
      http.patch('*/api/v1/admin/companies/:company/users/u-2/role', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeAdminUser({ id: 'u-2', role: 'admin' }) })
      }),
    )
    renderApp('/admin/users')

    const row = (await screen.findByText('Борис')).closest('tr')!
    await userEvent.click(
      within(row).getByRole('button', { name: 'Действия с пользователем «Борис»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Сделать администратором' }))

    expect(await screen.findByText('Роль изменена')).toBeInTheDocument()
    expect(body).toEqual({ role: 'admin' })
  })

  describe('передача владения', () => {
    const boris = {
      id: 'u-boris',
      name: 'Борис',
      email: 'boris@selen.test',
      status: 'active' as const,
    }

    beforeEach(() => {
      server.use(
        http.get('*/api/v1/admin/companies/:company/users', () =>
          HttpResponse.json(page([self(owner)])),
        ),
        http.get('*/api/v1/companies/:company/users/directory', () =>
          HttpResponse.json({
            data: [
              boris,
              { id: 'u-new', name: 'Новичок', email: 'new@selen.test', status: 'invited' },
              { id: owner.id, name: owner.name, email: owner.email, status: 'active' },
            ],
          }),
        ),
      )
    })

    it('выбор сотрудника и пароль; в списке — только активные и не сам Владелец', async () => {
      let request: { url: string; body: unknown } | undefined
      let meCalls = 0
      server.use(
        http.post(
          '*/api/v1/admin/companies/:company/users/:id/transfer-ownership',
          async ({ request: req }) => {
            request = { url: req.url, body: await req.json() }
            return HttpResponse.json({ data: makeAdminUser({ ...boris, role: 'owner' }) })
          },
        ),
        http.get('*/api/v1/auth/me', () => {
          meCalls++
          return HttpResponse.json({ data: meCalls > 1 ? { ...owner, role: 'admin' } : owner })
        }),
      )
      renderApp('/admin/users')

      await userEvent.click(await screen.findByRole('button', { name: 'Передать владение' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Новый Владелец'), 'о')
      expect(await within(dialog).findByRole('button', { name: /Борис/ })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: /Новичок/ })).toBeNull()
      expect(within(dialog).queryByRole('button', { name: /Ольга Владелец/ })).toBeNull()

      await userEvent.click(within(dialog).getByRole('button', { name: /Борис/ }))
      await userEvent.type(within(dialog).getByLabelText('Ваш пароль'), 'secret-password')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Передать владение' }))

      expect(
        await screen.findByText('Владение передано: Борис — новый Владелец'),
      ).toBeInTheDocument()
      expect(request?.url).toContain(`${ADMIN}/users/u-boris/transfer-ownership`)
      expect(request?.body).toEqual({ password: 'secret-password' })
      // Роль текущего пользователя перечитана: кнопка пропала — он больше не Владелец
      await screen.findByRole('button', { name: 'Пригласить' })
      expect(screen.queryByRole('button', { name: 'Передать владение' })).toBeNull()
    })

    it('без сотрудника и пароля — ошибки в полях; неверный пароль — ошибка с сервера', async () => {
      server.use(
        http.post('*/api/v1/admin/companies/:company/users/:id/transfer-ownership', () =>
          HttpResponse.json(
            { message: 'x', errors: { password: ['Неверный пароль.'] } },
            { status: 422 },
          ),
        ),
      )
      renderApp('/admin/users')

      await userEvent.click(await screen.findByRole('button', { name: 'Передать владение' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Передать владение' }))
      expect(await within(dialog).findByText('Выберите сотрудника')).toBeInTheDocument()
      expect(within(dialog).getByText('Введите пароль')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByLabelText('Новый Владелец'), 'Бор')
      await userEvent.click(await within(dialog).findByRole('button', { name: /Борис/ }))
      await userEvent.type(within(dialog).getByLabelText('Ваш пароль'), 'wrong')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Передать владение' }))

      expect(await within(dialog).findByText('Неверный пароль.')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
