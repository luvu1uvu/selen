import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminUser, Company } from '@/shared/types/api'
import {
  COMPANY_ADMIN_PERMISSIONS,
  makeAdminUser,
  makeNavSpace,
  makeSpace,
  makeUser,
  NO_USER_PERMISSIONS,
  server,
  signedInAs,
  TEST_COMPANY_ID,
} from '@/test/server'
import { renderApp } from '@/test/render'

/*
| Несколько компаний («Права 2.0», П2b-2; ADR-0024): экран Владельца «Компании», выбор компании в админке (только
| у кого их несколько), адреса /admin/c/<компания>/…, вкладки «Пользователей», заголовки компаний в дереве.
| У кого компания одна, названий компаний нигде нет.
*/

const SECOND = '01JTESTCOMPANY0000000000002'

const owner = makeUser({
  id: 'owner-1',
  name: 'Ольга Владелец',
  role: 'owner',
  admin_companies: [
    { id: TEST_COMPANY_ID, name: 'Компания 1', permissions: COMPANY_ADMIN_PERMISSIONS },
    { id: SECOND, name: 'Компания 2', permissions: COMPANY_ADMIN_PERMISSIONS },
  ],
})

/** Администратор двух компаний: выбор компании в админке. */
const twoCompanies = makeUser({
  id: 'admin-2',
  name: 'Ирина Морозова',
  admin_companies: owner.admin_companies,
})

function companies(): Company[] {
  return [
    {
      id: TEST_COMPANY_ID,
      name: 'Компания 1',
      created_at: '2026-10-23T00:00:00Z',
      people_count: 12,
      admins: [{ id: 'a-1', name: 'Анна Админова', email: 'admin@selen.test', status: 'active' }],
    },
    {
      id: SECOND,
      name: 'Компания 2',
      created_at: '2026-10-26T00:00:00Z',
      people_count: 0,
      admins: [],
    },
  ]
}

function usersPage(users: AdminUser[]) {
  return { data: users, meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length } }
}

// Выбранный раздел полосы и компания админки запоминаются в браузере — каждый тест с чистого листа
beforeEach(() => localStorage.clear())

describe('Админка нескольких компаний', () => {
  it('Владелец: «Компании» — список, создание и переименование', async () => {
    signedInAs(owner)
    const requests: unknown[] = []
    server.use(
      http.get('*/api/v1/admin/companies', () => HttpResponse.json({ data: companies() })),
      http.post('*/api/v1/admin/companies', async ({ request }) => {
        requests.push(['create', await request.json()])
        return HttpResponse.json(
          { data: { ...companies()[1], name: 'Компания 3' } },
          { status: 201 },
        )
      }),
      http.patch('*/api/v1/admin/companies/:id', async ({ request, params }) => {
        requests.push(['rename', params.id, await request.json()])
        return HttpResponse.json({ data: { ...companies()[1], name: 'Северный филиал' } })
      }),
    )
    renderApp('/admin/companies')

    const table = await screen.findByRole('table')
    const second = within(table).getByText('Компания 2').closest('tr')!
    expect(within(second).getByText('Нет')).toBeInTheDocument()
    expect(within(table).getByText('Анна Админова')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'Компания 2' })).toHaveAttribute(
      'href',
      `/admin/c/${SECOND}/users`,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Создать компанию' }))
    const create = await screen.findByRole('dialog', { name: 'Новая компания' })
    expect(create).toHaveTextContent('«Все сотрудники»')
    await userEvent.type(within(create).getByLabelText('Название'), 'Компания 3')
    await userEvent.click(within(create).getByRole('button', { name: 'Создать' }))
    expect(await screen.findByText('Компания «Компания 3» создана')).toBeInTheDocument()

    await userEvent.click(
      within(second).getByRole('button', { name: 'Действия с компанией «Компания 2»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать…' }))
    const rename = await screen.findByRole('dialog', { name: 'Переименовать компанию' })
    const name = within(rename).getByLabelText('Название')
    expect(name).toHaveValue('Компания 2')
    await userEvent.clear(name)
    await userEvent.type(name, 'Северный филиал')
    await userEvent.click(within(rename).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Компания переименована')).toBeInTheDocument()

    expect(requests).toEqual([
      ['create', { name: 'Компания 3' }],
      ['rename', SECOND, { name: 'Северный филиал' }],
    ])
  })

  it('Владелец назначает администратора компании из её сотрудников', async () => {
    signedInAs(owner)
    let assigned: unknown
    server.use(
      http.get('*/api/v1/admin/companies', () => HttpResponse.json({ data: companies() })),
      http.get(`*/api/v1/companies/${SECOND}/users/directory`, ({ request }) => {
        // Только «дома» компании: Владельца без «дома» в ней администратором не назначить
        expect(new URL(request.url).searchParams.get('homes')).toBe('1')
        return HttpResponse.json({
          data: [{ id: 'u-vera', name: 'Вера Нова', email: 'vera@selen.test', status: 'active' }],
        })
      }),
      http.patch(`*/api/v1/admin/companies/${SECOND}/users/u-vera/role`, async ({ request }) => {
        assigned = await request.json()
        return HttpResponse.json({ data: makeAdminUser({ id: 'u-vera' }) })
      }),
    )
    renderApp('/admin/companies')

    const row = (await screen.findByText('Компания 2')).closest('tr')!
    await userEvent.click(
      within(row).getByRole('button', { name: 'Действия с компанией «Компания 2»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Администраторы…' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Администраторы компании «Компания 2»',
    })
    // Фокус — в поиске, а не на «Снять» (U-2 UX-ревью)
    await waitFor(() => expect(within(dialog).getByPlaceholderText(/Поиск/)).toHaveFocus())
    await userEvent.click(await within(dialog).findByRole('button', { name: /Вера Нова/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Назначить' }))

    expect(await screen.findByText('Вера Нова — администратор компании')).toBeInTheDocument()
    expect(assigned).toEqual({ role: 'admin' })
  })

  it('«Компании» — только Владельцу: администратору нет ни пункта, ни страницы', async () => {
    signedInAs(makeUser())
    const { router } = renderApp('/admin/companies')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await userEvent.click(await screen.findByRole('button', { name: 'Администрирование' }))
    const nav = screen.getByRole('navigation', { name: 'Администрирование' })
    expect(within(nav).queryByRole('link', { name: 'Компании' })).not.toBeInTheDocument()
  })

  it('выбор компании — у администратора нескольких: тот же раздел другой компании, ключи кеша с компанией', async () => {
    signedInAs(twoCompanies)
    const asked: string[] = []
    server.use(
      http.get('*/api/v1/admin/companies/:company/groups', ({ params }) => {
        asked.push(String(params.company))
        const name = params.company === SECOND ? 'Группа второй' : 'Группа первой'
        return HttpResponse.json({
          data: [
            {
              id: `g-${String(params.company)}`,
              name,
              description: null,
              system: null,
              archived_at: null,
              created_at: '2026-10-26T00:00:00Z',
              members_count: 0,
              spaces_count: 0,
            },
          ],
        })
      }),
    )
    const { router } = renderApp(`/admin/c/${TEST_COMPANY_ID}/groups`)

    expect(await screen.findByText('Группа первой')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Администрирование' }))
    const nav = screen.getByRole('navigation', { name: 'Администрирование' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Компания: Компания 1' }))
    const options = await screen.findAllByRole('menuitemcheckbox')
    expect(options.map((option) => option.textContent)).toEqual(['Компания 1', 'Компания 2'])
    expect(options[0]).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(options[1])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/c/${SECOND}/groups`))
    expect(await screen.findByText('Группа второй')).toBeInTheDocument()
    expect(screen.queryByText('Группа первой')).not.toBeInTheDocument()
    expect(asked).toEqual([TEST_COMPANY_ID, SECOND])
  })

  it('у кого компания одна — выбора нет и названия компании нигде нет', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(usersPage([makeAdminUser({ permissions: NO_USER_PERMISSIONS })])),
      ),
    )
    renderApp('/admin/users')

    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Администрирование' }))
    const nav = screen.getByRole('navigation', { name: 'Администрирование' })
    expect(within(nav).queryByRole('button', { name: /^Компания:/ })).not.toBeInTheDocument()
    expect(nav).not.toHaveTextContent('Компани')
    expect(screen.getByRole('main')).not.toHaveTextContent('Компани')
  })

  it('чужая или несуществующая компания в адресе — «Страница не найдена», запросов к ней нет', async () => {
    signedInAs(makeUser())
    let asked = false
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () => {
        asked = true
        return HttpResponse.json({ message: 'Не найдено.' }, { status: 404 })
      }),
    )
    renderApp(`/admin/c/${SECOND}/users`)

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument()
    expect(asked).toBe(false)
  })

  it('«Пользователи» — вкладки как в Kaiten: пользователи, группы, приглашения', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () => HttpResponse.json(usersPage([]))),
      http.get('*/api/v1/admin/companies/:company/invitations', () =>
        HttpResponse.json({
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
        }),
      ),
    )
    const { router } = renderApp(`/admin/c/${TEST_COMPANY_ID}/users`)

    const tabs = await screen.findByRole('navigation', { name: 'Разделы «Пользователей»' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Пользователи', 'Группы', 'Приглашения'])
    expect(within(tabs).getByRole('link', { name: 'Пользователи' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await userEvent.click(within(tabs).getByRole('link', { name: 'Приглашения' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/admin/c/${TEST_COMPANY_ID}/invitations`),
    )
    expect(within(tabs).getByRole('link', { name: 'Приглашения' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeInTheDocument()
  })

  it('человек с «домами» в нескольких компаниях: действий нет, подсказка — только Владелец', async () => {
    signedInAs(makeUser({ id: 'admin-1' }))
    server.use(
      http.get('*/api/v1/admin/companies/:company/users', () =>
        HttpResponse.json(
          usersPage([
            makeAdminUser({
              id: 'u-both',
              name: 'Олег Никитин',
              role: 'member',
              permissions: { ...NO_USER_PERMISSIONS, owner_only: true },
            }),
          ]),
        ),
      ),
    )
    renderApp('/admin/users')

    const row = (await screen.findByText('Олег Никитин')).closest('tr')!
    expect(within(row).queryByRole('button', { name: /Действия с пользователем/ })).toBeNull()
    await userEvent.hover(within(row).getByRole('link', { name: 'Доступ к пространствам' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'деактивировать и активировать его может только Владелец',
    )
  })
})

describe('Дерево нескольких компаний', () => {
  it('заголовки компаний — если их несколько; «+» — в заголовке компании, которой управляешь', async () => {
    signedInAs(makeUser({ admin_companies: [owner.admin_companies![0]] }))
    const first = makeSpace({ id: 's-dev', key: 'DEV', name: 'Разработка' })
    const second = makeSpace({ id: 's-sales', key: 'SALES', name: 'Продажи', company_id: SECOND })
    server.use(
      http.get('*/api/v1/navigation', () =>
        HttpResponse.json({
          data: [
            { id: TEST_COMPANY_ID, name: 'Компания 1', items: [makeNavSpace(first)] },
            { id: SECOND, name: 'Компания 2', items: [makeNavSpace(second, { id: 'n-sales' })] },
          ],
        }),
      ),
    )
    renderApp('/')

    const tree = await screen.findByRole('navigation', { name: 'Дерево' })
    const one = await within(tree).findByRole('region', { name: 'Компания 1' })
    const two = within(tree).getByRole('region', { name: 'Компания 2' })
    expect(within(one).getByRole('link', { name: 'Разработка' })).toBeInTheDocument()
    expect(within(two).getByRole('link', { name: 'Продажи' })).toBeInTheDocument()
    // Структуру «Компании 1» он ведёт — «+» у её заголовка; «Компании 2» — нет; «+» у поиска нет
    // В подписи «+» — название компании (кнопок несколько); «+» у поиска при нескольких деревьях нет
    expect(within(one).getByRole('button', { name: 'Добавить в «Компания 1»' })).toBeInTheDocument()
    expect(
      within(two).queryByRole('button', { name: 'Добавить в «Компания 2»' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить в дерево' })).not.toBeInTheDocument()
  })

  it('компания одна — заголовка нет, дерево как раньше', async () => {
    signedInAs(makeUser({ role: 'member' }))
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
  })
})
