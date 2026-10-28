import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminUser, Group, UserAccess, UserCompanyPermission } from '@/shared/types/api'
import {
  makeAdminUser,
  makeUser,
  NO_USER_PERMISSIONS,
  server,
  signedInAs,
  TEST_COMPANY_ID,
} from '@/test/server'
import { renderApp } from '@/test/render'

/*
| П2c-2: «Последняя активность» и сортировка, «Завершить все сеансы», смена email (LATER-9), окно отключения
| у деактивированного, права администратора компании и подтверждение для «Все сотрудники», страница подтверждения email.
*/

const owner = makeUser({ id: 'owner-1', name: 'Ольга Владелец', role: 'owner' })

const page = (users: AdminUser[]) => ({
  data: users,
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length },
})

const boris = makeAdminUser({
  id: 'u-2',
  name: 'Борис',
  email: 'boris@selen.test',
  role: 'member',
  last_seen_at: '2026-10-28T09:00:00Z',
})

function usersList(users: AdminUser[], sorts: (string | null)[] = []) {
  return http.get('*/api/v1/admin/companies/:company/users', ({ request }) => {
    sorts.push(new URL(request.url).searchParams.get('sort'))
    return HttpResponse.json(page(users))
  })
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!

async function openMenu(name: string) {
  const row = await rowOf(name)
  await userEvent.click(
    within(row).getByRole('button', { name: `Действия с пользователем «${name}»` }),
  )
}

describe('«Пользователи» (П2c-2)', () => {
  beforeEach(() => signedInAs(owner))

  it('«Последняя активность»: время в строке; заголовок сортирует — недавние, давние, по имени', async () => {
    const sorts: (string | null)[] = []
    server.use(
      usersList([makeAdminUser({ ...owner, permissions: NO_USER_PERMISSIONS }), boris], sorts),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    const row = await rowOf('Борис')
    expect(row).toHaveTextContent('28 окт. 2026 г., 12:00')
    const header = screen.getByRole('columnheader', { name: /Последняя активность/ })
    expect(header).not.toHaveAttribute('aria-sort')

    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() => expect(sorts).toContain('-last_seen'))
    expect(header).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() => expect(sorts).toContain('last_seen'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() => expect(header).not.toHaveAttribute('aria-sort'))
    expect(sorts.at(-1)).toBeNull()
  })

  it('«Завершить все сеансы…» — после подтверждения', async () => {
    let terminated = false
    server.use(
      usersList([boris]),
      http.post('*/api/v1/admin/companies/:company/users/u-2/terminate-sessions', () => {
        terminated = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await openMenu('Борис')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Завершить все сеансы…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Завершить все сеансы?' })
    expect(dialog).toHaveTextContent('Борис выйдет из Selen на всех устройствах')
    expect(terminated).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Завершить сеансы' }))

    await waitFor(() => expect(terminated).toBe(true))
    expect(await screen.findByText('Все сеансы пользователя завершены')).toBeInTheDocument()
  })

  it('«Изменить email…»: новый адрес уходит на сервер, ошибка 422 — под полем; ждущий адрес — в строке, «Отменить»', async () => {
    let body: unknown
    let cancelled = false
    let pending = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          page([
            pending
              ? {
                  ...boris,
                  email_change: {
                    email: 'boris.new@selen.test',
                    expires_at: '2026-10-31T09:00:00Z',
                    expired: false,
                  },
                }
              : boris,
          ]),
        ),
      ),
      http.post('*/api/v1/admin/companies/:company/users/u-2/email-change', async ({ request }) => {
        body = await request.json()
        if ((body as { email: string }).email === 'taken@selen.test') {
          return HttpResponse.json(
            {
              message: 'Этот email уже используется в Selen.',
              errors: { email: ['Этот email уже используется в Selen.'] },
            },
            { status: 422 },
          )
        }
        pending = true
        return HttpResponse.json({ data: boris })
      }),
      http.delete('*/api/v1/admin/companies/:company/users/u-2/email-change', () => {
        cancelled = true
        pending = false
        return HttpResponse.json({ data: boris })
      }),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await openMenu('Борис')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Изменить email…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить email' })
    expect(dialog).toHaveTextContent('Сейчас: boris@selen.test')
    const field = within(dialog).getByLabelText('Новый email')
    expect(field).toHaveFocus()

    await userEvent.type(field, 'taken@selen.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отправить ссылку' }))
    expect(
      await within(dialog).findByText('Этот email уже используется в Selen.'),
    ).toBeInTheDocument()

    await userEvent.clear(field)
    await userEvent.type(field, 'boris.new@selen.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отправить ссылку' }))
    await waitFor(() => expect(body).toEqual({ email: 'boris.new@selen.test' }))
    expect(
      await screen.findByText('Письмо со ссылкой отправлено на boris.new@selen.test'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Новый: boris.new@selen.test — ждёт подтверждения'),
    ).toBeInTheDocument()

    await openMenu('Борис')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Отменить смену email' }))
    await waitFor(() => expect(cancelled).toBe(true))
    await waitFor(() =>
      expect(screen.queryByText('Новый: boris.new@selen.test — ждёт подтверждения')).toBeNull(),
    )
  })

  it('без права — пунктов «Изменить email…» и «Завершить все сеансы…» нет; у приглашённого — тоже', async () => {
    server.use(
      usersList([
        {
          ...boris,
          permissions: { ...boris.permissions, change_email: false, terminate_sessions: false },
        },
        makeAdminUser({
          id: 'u-3',
          name: 'Вера',
          role: 'member',
          status: 'invited',
          invitation: { id: 'inv-3', state: 'pending', expires_at: '2026-10-31T00:00:00Z' },
        }),
      ]),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await openMenu('Борис')
    expect(await screen.findByRole('menuitem', { name: 'Деактивировать…' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Изменить email…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Завершить все сеансы…' })).toBeNull()
    await userEvent.keyboard('{Escape}')

    await openMenu('Вера')
    expect(
      await screen.findByRole('menuitem', { name: /Отозвать приглашение/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Изменить email…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Завершить все сеансы…' })).toBeNull()
  })

  it('«Отключить учётную запись…» у уже деактивированного — свой текст (решение PM 28.10, п. 4)', async () => {
    server.use(usersList([{ ...boris, status: 'deactivated' }]))
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await openMenu('Борис')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Отключить учётную запись…' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Отключить учётную запись?' })
    expect(dialog).toHaveTextContent(
      'Человек деактивирован в этой компании. После отключения он не сможет войти ни в одну компанию',
    )
  })

  it('деактивация администратора: вернуть может только Владелец; участника — любой администратор', async () => {
    server.use(
      usersList([boris, makeAdminUser({ id: 'u-4', name: 'Глеб', role: 'admin' })]),
      http.get('*/api/v1/admin/companies/:company/users/:user/deactivation-impact', () =>
        HttpResponse.json({ data: { last_admin_spaces: [] } }),
      ),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await openMenu('Борис')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Деактивировать…' }))
    let dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Вернуть в компанию может любой её администратор')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openMenu('Глеб')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Деактивировать…' }))
    dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Вернуть администратора компании можете только вы')
  })
})

function permission(
  value: UserCompanyPermission['permission'],
  overrides: Partial<UserCompanyPermission> = {},
): UserCompanyPermission {
  return {
    permission: value,
    personal: false,
    groups: [],
    by_admin_role: false,
    effective: false,
    editable: true,
    ...overrides,
  }
}

describe('«Права компании» (П2c-2)', () => {
  beforeEach(() => signedInAs(owner))

  it('у администратора компании его права — отмеченные недоступные галочки с подсказкой; выданное лично не теряется', async () => {
    const access: UserAccess = {
      user: {
        id: 'u-4',
        name: 'Глеб',
        email: 'gleb@selen.test',
        role: 'admin',
        status: 'active',
        guest: null,
      },
      groups: [],
      spaces: [],
    }
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users/:user/access', () =>
        HttpResponse.json({ data: access }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/:user/permissions', () =>
        HttpResponse.json({
          data: [
            permission('company.view_event_log', {
              by_admin_role: true,
              personal: true,
              effective: true,
            }),
            permission('company.manage_trash', { by_admin_role: true, effective: true }),
            permission('company.view_time_analytics'),
          ],
        }),
      ),
      http.put('*/api/v1/admin/companies/:company/users/:user/permissions', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: [] })
      }),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users/u-4`)

    // Названия — глаголом в одном виде (решение PM по отчёту П2c-1, п. 6)
    const log = await screen.findByRole('checkbox', { name: 'Смотреть журнал событий' })
    const trash = screen.getByRole('checkbox', { name: 'Возвращать из корзины' })
    for (const box of [log, trash]) {
      expect(box).toBeChecked()
      expect(box).toBeDisabled()
    }
    await userEvent.hover(log)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Это право у администратора компании уже есть',
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Смотреть аналитику трудозатрат' }))
    await waitFor(() =>
      expect(body).toEqual({
        permissions: ['company.view_time_analytics', 'company.view_event_log'],
      }),
    )
  })

  it('право группе «Все сотрудники» — только после подтверждения; снять — без него', async () => {
    const everyone: Group = {
      id: 'g-all',
      name: 'Все сотрудники',
      description: null,
      system: 'everyone',
      archived_at: null,
      created_at: '2026-10-01T00:00:00Z',
      members_count: 3,
      spaces_count: 0,
      members: [],
      spaces: [],
    } as unknown as Group
    const bodies: unknown[] = []
    let granted = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups/g-all', () =>
        HttpResponse.json({ data: everyone }),
      ),
      http.get('*/api/v1/admin/companies/:company/groups/g-all/permissions', () =>
        HttpResponse.json({
          data: [
            { permission: 'company.invite_users', granted, editable: true },
            { permission: 'company.view_event_log', granted: false, editable: true },
          ],
        }),
      ),
      http.put(
        '*/api/v1/admin/companies/:company/groups/g-all/permissions',
        async ({ request }) => {
          const body = (await request.json()) as { permissions: string[] }
          bodies.push(body)
          granted = body.permissions.includes('company.invite_users')
          return HttpResponse.json({ data: [] })
        },
      ),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/groups/g-all`)

    const invite = await screen.findByRole('checkbox', { name: 'Приглашать пользователей' })
    await userEvent.click(invite)
    let dialog = await screen.findByRole('dialog', { name: 'Выдать право всем сотрудникам?' })
    expect(dialog).toHaveTextContent('Право «Приглашать пользователей» получат все сотрудники')
    expect(bodies).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bodies).toEqual([])

    await userEvent.click(invite)
    dialog = await screen.findByRole('dialog', { name: 'Выдать право всем сотрудникам?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Выдать всем' }))
    await waitFor(() => expect(bodies).toEqual([{ permissions: ['company.invite_users'] }]))

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Приглашать пользователей' })).toBeChecked(),
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Приглашать пользователей' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ permissions: [] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Подтверждение нового email по ссылке (П2c-2)', () => {
  it('показывает адрес; email меняет только кнопка', async () => {
    let confirmed = false
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ message: 'no' }, { status: 401 })),
      http.get('*/api/v1/email-changes/tok', () =>
        HttpResponse.json({ data: { email: 'boris.new@selen.test' } }),
      ),
      http.post('*/api/v1/email-changes/tok/confirm', () => {
        confirmed = true
        return HttpResponse.json({ data: { email: 'boris.new@selen.test' } })
      }),
    )
    renderApp('/email-change/tok')

    expect(
      await screen.findByText('Подтвердите новый email для входа в Selen: boris.new@selen.test.'),
    ).toBeInTheDocument()
    expect(confirmed).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить адрес' }))

    expect(
      await screen.findByText(
        'Email изменён на boris.new@selen.test. Войдите с новым адресом и прежним паролем.',
      ),
    ).toBeInTheDocument()
    expect(confirmed).toBe(true)
  })

  it('ссылка недействительна — текст сервера, кнопки нет', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ message: 'no' }, { status: 401 })),
      http.get('*/api/v1/email-changes/old', () =>
        HttpResponse.json(
          {
            message: 'Ссылка недействительна или устарела.',
            errors: { token: ['Ссылка недействительна или устарела.'] },
          },
          { status: 422 },
        ),
      ),
    )
    renderApp('/email-change/old')

    expect(await screen.findByText('Ссылка недействительна или устарела.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Подтвердить адрес' })).toBeNull()
  })
})
