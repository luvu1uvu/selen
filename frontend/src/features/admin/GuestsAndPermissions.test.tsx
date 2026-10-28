import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { UserAccess, UserCompanyPermission } from '@/shared/types/api'
import { makeAdminUser, makeUser, server, signedInAs, TEST_COMPANY_ID } from '@/test/server'
import { renderApp } from '@/test/render'

/*
| П2c-1: «Права компании» (галочки), окно гостя, «Администрирование» участника с одним правом компании.
*/

const page = (users: ReturnType<typeof makeAdminUser>[]) => ({
  data: users,
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length },
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

const dinaAccess: UserAccess = {
  user: { id: 'u-dina', name: 'Дина', email: 'dina@selen.test', role: 'member', status: 'active' },
  groups: [],
  spaces: [],
}

describe('Права компании у человека', () => {
  it('администратор меняет свои галочки; право от Владельца не отправляет и не теряет', async () => {
    signedInAs(makeUser({ id: 'admin-1' }))
    let body: unknown
    server.use(
      http.get('*/api/v1/admin/companies/:company/users/:user/access', () =>
        HttpResponse.json({ data: dinaAccess }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/:user/permissions', () =>
        HttpResponse.json({
          data: [
            permission('company.invite_users'),
            permission('company.view_time_analytics', {
              personal: true,
              effective: true,
              editable: false,
            }),
          ],
        }),
      ),
      http.put('*/api/v1/admin/companies/:company/users/:user/permissions', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: [] })
      }),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users/u-dina`)

    const analytics = await screen.findByRole('checkbox', {
      name: 'Смотреть аналитику трудозатрат',
    })
    expect(analytics).toBeChecked()
    expect(analytics).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Приглашать пользователей' }))

    await waitFor(() => expect(body).toEqual({ permissions: ['company.invite_users'] }))
    expect(await screen.findByText('Права сохранены')).toBeInTheDocument()
    // У каждой галочки — что открывает право (решение PM 28.10)
    expect(
      screen.getByText('видит сводные отчёты по учтённому времени всех сотрудников'),
    ).toBeInTheDocument()
  })

  it('нет права смотреть (администратор чужих прав, гость) — раздела нет', async () => {
    signedInAs(makeUser({ id: 'admin-1' }))
    server.use(
      http.get('*/api/v1/admin/companies/:company/users/:user/access', () =>
        HttpResponse.json({ data: dinaAccess }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/:user/permissions', () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users/u-dina`)

    expect(await screen.findByText('Доступ к пространствам')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Права компании')).toBeNull())
  })
})

describe('Окно гостя', () => {
  it('меняются только пространства, где автор выдаёт доступ; остальные — для чтения', async () => {
    signedInAs(makeUser({ id: 'admin-1' }))
    let body: unknown
    const guest = makeAdminUser({
      id: 'u-guest',
      name: 'Олег Гость',
      guest: { expires_at: null, expired: false },
      permissions: { ...makeAdminUser().permissions, manage_guest: true },
    })
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () => HttpResponse.json(page([guest]))),
      http.get('*/api/v1/admin/companies/:company/grantable-spaces', () =>
        HttpResponse.json({ data: [{ id: 's-dev', key: 'DEV', name: 'Разработка' }] }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/:user/access', () =>
        HttpResponse.json({
          data: {
            user: {
              id: 'u-guest',
              name: 'Олег Гость',
              email: 'g@selen.test',
              role: 'member',
              status: 'active',
            },
            groups: [],
            spaces: ['s-dev', 's-old'].map((id) => ({
              space: {
                id,
                key: id === 's-dev' ? 'DEV' : 'OLD',
                name: id === 's-dev' ? 'Разработка' : 'Архив',
                archived_at: null,
              },
              has_access: true,
              role: 'commenter',
              sees_all_cards: true,
              sources: [
                {
                  type: 'personal',
                  group: null,
                  role: 'commenter',
                  own_cards_only: false,
                  inactive_reason: null,
                },
              ],
            })),
          },
        }),
      ),
      http.put('*/api/v1/admin/companies/:company/guests/:user', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: guest })
      }),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await userEvent.click(await screen.findByRole('button', { name: /Действия с пользователем/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Изменить доступ гостя…' }))
    expect(await screen.findByText('Архив (OLD) — Комментатор')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(body).toEqual({
        expires_on: null,
        spaces: [{ space_id: 's-dev', role: 'commenter', own_cards_only: false }],
      }),
    )
  })
})

describe('«Администрирование» участника с отдельными правами', () => {
  it('только «приглашать»: адрес компании и «Пользователи» ведут во вкладку «Приглашения»', async () => {
    signedInAs(
      makeUser({
        role: 'member',
        admin_companies: [
          { id: TEST_COMPANY_ID, name: null, permissions: ['company.invite_users'] },
        ],
      }),
    )
    server.use(
      http.get('*/api/v1/admin/companies/:company/invitations', () =>
        HttpResponse.json({
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
        }),
      ),
    )
    const { router } = renderApp(`/admin/c/${TEST_COMPANY_ID}`)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/admin/c/${TEST_COMPANY_ID}/invitations`),
    )
    expect(
      await screen.findByText('Приглашений пока нет — пригласите сотрудника кнопкой «Пригласить»'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Группы' })).toBeNull()
  })

  it('право без своей страницы («управлять доступом») «Администрирование» не открывает', async () => {
    signedInAs(
      makeUser({
        role: 'member',
        admin_companies: [
          { id: TEST_COMPANY_ID, name: null, permissions: ['company.manage_access'] },
        ],
      }),
    )
    const { router } = renderApp('/admin')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
