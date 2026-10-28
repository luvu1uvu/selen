import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminUser, UserCompanyPermission } from '@/shared/types/api'
import {
  makeAdminUser,
  makeNavSpace,
  makeSpace,
  makeUser,
  server,
  signedInAs,
  TEST_COMPANY_ID,
} from '@/test/server'
import { renderApp } from '@/test/render'

/*
| Режим «одна компания» (ADR-0026): каждая команда — своя копия Selen, режим сообщает /auth/me (multi_company: false).
| Нет «Компаний» и гостей; тексты — без других компаний; то, что и так скрыто при одной компании (выбор компании,
| названия компаний в дереве и в окне приглашения), остаётся скрытым — и у Владельца.
*/

const owner = makeUser({
  id: 'owner-1',
  name: 'Ольга Владелец',
  role: 'owner',
  multi_company: false,
})

function usersPage(users: AdminUser[]) {
  return { data: users, meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length } }
}

const boris = makeAdminUser({ id: 'u-2', name: 'Борис', role: 'member' })

beforeEach(() => {
  localStorage.clear()
  signedInAs(owner)
  server.use(
    http.get('*/api/v1/admin/companies/:company/users', () =>
      HttpResponse.json(
        usersPage([makeAdminUser({ ...owner, permissions: boris.permissions }), boris]),
      ),
    ),
    http.get('*/api/v1/admin/companies/:company/users/:user/deactivation-impact', () =>
      HttpResponse.json({ data: { last_admin_spaces: [] } }),
    ),
    http.get('*/api/v1/admin/companies/:company/events', () =>
      HttpResponse.json({
        data: [],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 0 },
      }),
    ),
  )
})

describe('Режим «одна компания»', () => {
  it('у Владельца нет «Компаний»: ни пункта меню, ни страницы, ни запроса к API', async () => {
    let asked = false
    server.use(
      http.get('*/api/v1/admin/companies', () => {
        asked = true
        return HttpResponse.json({ message: 'Не найдено.' }, { status: 404 })
      }),
    )
    renderApp('/admin/companies')

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Администрирование' }))
    const nav = screen.getByRole('navigation', { name: 'Администрирование' })
    expect(within(nav).getByRole('link', { name: 'Пользователи' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Компании' })).not.toBeInTheDocument()
    // Выбора компании нет — компания одна
    expect(within(nav).queryByRole('button', { name: /^Компания:/ })).not.toBeInTheDocument()
    expect(nav).not.toHaveTextContent('Компани')
    expect(asked).toBe(false)
  })

  it('«Пользователи»: нет «Добавить гостя» и фильтра «Гости»; пояснение — без гостей', async () => {
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    expect(await screen.findByText('Борис')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить гостя' })).not.toBeInTheDocument()
    const status = screen.getByRole('combobox', { name: 'Статус' })
    expect(
      within(status)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Все', 'Активные', 'Приглашённые', 'Деактивированные'])
    expect(
      screen.getByText(
        'Сотрудники компании: роли, деактивация, доступ к пространствам и права компании.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/гост/i)
  })

  it('приглашение: поля «Компания» нет, текст — без «уже есть учётная запись»', async () => {
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    await userEvent.click(await screen.findByRole('button', { name: 'Пригласить' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Мы отправим письмо со ссылкой: новый сотрудник сам задаст пароль (ссылка действует 72 часа).',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Компания')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('учётная запись в Selen')
  })

  it('деактивация и отключение учётной записи — тексты без других компаний', async () => {
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    const row = (await screen.findByText('Борис')).closest('tr')!
    const menu = () =>
      userEvent.click(within(row).getByRole('button', { name: 'Действия с пользователем «Борис»' }))
    await menu()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Деактивировать…' }))
    let dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Деактивировать пользователя?' }),
    ).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('других компаний')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await menu()
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Отключить учётную запись…' }),
    )
    dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Борис не сможет войти, все сеансы завершатся.')
    expect(dialog).not.toHaveTextContent(/компани[июй] сохранится|ни в одну компанию/)
  })

  it('права компании: «Управлять пользователями» — без гостей', async () => {
    const permission = (value: UserCompanyPermission['permission']): UserCompanyPermission => ({
      permission: value,
      personal: false,
      groups: [],
      by_admin_role: false,
      effective: false,
      editable: true,
    })
    server.use(
      http.get('*/api/v1/admin/companies/:company/users/:user/access', () =>
        HttpResponse.json({
          data: {
            user: {
              id: 'u-2',
              name: 'Борис',
              email: 'boris@selen.test',
              role: 'member',
              status: 'active',
              guest: null,
            },
            groups: [],
            spaces: [],
          },
        }),
      ),
      http.get('*/api/v1/admin/companies/:company/users/:user/permissions', () =>
        HttpResponse.json({
          data: [permission('company.invite_users'), permission('company.manage_users')],
        }),
      ),
    )
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users/u-2`)

    expect(
      await screen.findByRole('checkbox', { name: 'Управлять пользователями' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'видит всех сотрудников, пространства и группы компании; деактивирует и возвращает участников',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/гост/i)
  })

  it('журнал: в фильтре нет событий компаний и гостей', async () => {
    renderApp(`/admin/c/${TEST_COMPANY_ID}/events`)

    const filter = await screen.findByRole('combobox', { name: 'Тип события' })
    const options = within(filter)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toContain('Пользователь деактивирован')
    expect(options).not.toContain('Компания создана')
    expect(options).not.toContain('Компания переименована')
    expect(options).not.toContain('Сотрудник добавлен в компанию')
    expect(options).not.toContain('Гость добавлен')
  })

  it('дерево — без названия компании, и у Владельца', async () => {
    server.use(
      http.get('*/api/v1/navigation', () =>
        HttpResponse.json({
          data: [{ id: TEST_COMPANY_ID, name: null, items: [makeNavSpace(makeSpace())] }],
        }),
      ),
    )
    renderApp('/')

    const tree = await screen.findByRole('navigation', { name: 'Дерево' })
    expect(await within(tree).findByRole('link', { name: 'Разработка' })).toBeInTheDocument()
    expect(within(tree).queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(tree).not.toHaveTextContent('Компани')
  })
})

describe('Режим «несколько компаний» (для сравнения)', () => {
  it('у Владельца есть «Компании», в «Пользователях» — «Добавить гостя» и фильтр «Гости»', async () => {
    signedInAs({ ...owner, multi_company: true })
    renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    expect(await screen.findByRole('button', { name: 'Добавить гостя' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Гости' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Администрирование' }))
    const nav = screen.getByRole('navigation', { name: 'Администрирование' })
    expect(within(nav).getByRole('link', { name: 'Компании' })).toBeInTheDocument()
  })
})
