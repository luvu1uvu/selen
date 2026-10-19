import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { NavTreeNode } from '@/shared/types/api'
import { makeNavSpace, makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })
const member = makeUser({ id: 'member-1', name: 'Иван', role: 'member' })

const ios = makeSpace({ id: 's-ios', key: 'IOS', name: 'iOS', my_role: 'commenter' })
const mgmt = makeSpace({ id: 's-mgmt', key: 'MGMT', name: 'Management', my_role: 'commenter' })

const tree: NavTreeNode[] = [
  {
    type: 'folder',
    id: 'f-mobile',
    name: 'Mobile',
    icon: '📱',
    everyone: true,
    empty: false,
    children: [
      makeNavSpace(ios, { everyone: true, boards: [{ id: 'b-ios', name: 'Релизы iOS' }] }),
    ],
  },
  makeNavSpace(mgmt, { icon: '📊', everyone: false, boards: [] }),
]

function withTree(nodes: NavTreeNode[] = tree) {
  server.use(http.get('*/api/v1/navigation', () => HttpResponse.json({ data: nodes })))
}

async function treeNav() {
  return screen.findByRole('navigation', { name: 'Дерево' })
}

/** Ссылка дерева по адресу: в названии строки есть и значок «доступно всем», и названия досок. */
function linkTo(nav: HTMLElement, href: string) {
  return within(nav)
    .queryAllByRole('link')
    .find((link) => link.getAttribute('href') === href)
}

describe('Панель «Дерево»', () => {
  beforeEach(() => window.localStorage.clear())

  it('папки свёрнуты, раскрытие запоминается для пользователя', async () => {
    signedInAs(member)
    withTree()
    const user = userEvent.setup()
    const { unmount } = renderApp('/')

    const nav = await treeNav()
    const folder = await within(nav).findByRole('button', { name: /Mobile/ })
    expect(folder).toHaveAttribute('aria-expanded', 'false')
    expect(within(nav).queryByRole('link', { name: /iOS/ })).not.toBeInTheDocument()
    // Пространство без досок видно в корне и без стрелки раскрытия
    expect(within(nav).getByRole('link', { name: /Management/ })).toHaveAttribute(
      'href',
      '/spaces/MGMT',
    )
    expect(within(nav).queryByRole('button', { name: 'Раскрыть «Management»' })).toBeNull()

    await user.click(folder)
    expect(await within(nav).findByRole('link', { name: /iOS/ })).toHaveAttribute(
      'href',
      '/spaces/IOS',
    )
    await user.click(within(nav).getByRole('button', { name: 'Раскрыть «iOS»' }))
    expect(within(nav).getByRole('link', { name: 'Релизы iOS' })).toHaveAttribute(
      'href',
      '/boards/b-ios',
    )
    expect(JSON.parse(window.localStorage.getItem('selen.nav.expanded.member-1') ?? '[]')).toEqual([
      'f-mobile',
      'node-IOS',
    ])

    // После перезагрузки страницы раскрытое остаётся раскрытым
    unmount()
    renderApp('/')
    const again = await treeNav()
    expect(await within(again).findByRole('link', { name: 'Релизы iOS' })).toBeInTheDocument()

    await user.click(within(again).getByRole('button', { name: /Mobile/ }))
    expect(linkTo(again, '/spaces/IOS')).toBeUndefined()
  })

  it('значок «доступно всем» — у открытого всем пространства и у папки', async () => {
    signedInAs(member)
    withTree()
    const user = userEvent.setup()
    renderApp('/')

    const nav = await treeNav()
    const folder = await within(nav).findByRole('button', { name: /Mobile/ })
    expect(
      within(folder).getByText('Все пространства папки доступны всем сотрудникам'),
    ).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Management/ })).not.toHaveTextContent(
      'Доступно всем сотрудникам',
    )

    await user.click(folder)
    await waitFor(() => expect(linkTo(nav, '/spaces/IOS')).toBeDefined())
    expect(linkTo(nav, '/spaces/IOS')).toHaveTextContent('Доступно всем сотрудникам')
  })

  it('переход по ссылке раскрывает путь к текущему пространству', async () => {
    signedInAs(member)
    withTree()
    server.use(http.get('*/api/v1/spaces/IOS', () => HttpResponse.json({ data: ios })))
    renderApp('/spaces/IOS')

    const nav = await treeNav()
    await waitFor(() => expect(linkTo(nav, '/spaces/IOS')).toHaveAttribute('aria-current', 'page'))
    expect(within(nav).getByRole('button', { name: /Mobile/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('поиск находит доску по части названия вместе с родительской папкой', async () => {
    signedInAs(member)
    withTree()
    const user = userEvent.setup()
    renderApp('/')

    const nav = await treeNav()
    await within(nav).findByRole('button', { name: /Mobile/ })
    const search = screen.getByRole('searchbox', { name: 'Поиск по дереву' })

    await user.type(search, 'релиз')
    expect(within(nav).getByRole('button', { name: /Mobile/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(linkTo(nav, '/spaces/IOS')).toBeDefined()
    expect(within(nav).getByRole('link', { name: 'Релизы iOS' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Management/ })).not.toBeInTheDocument()

    // Раскрытие на время поиска не запоминается
    expect(window.localStorage.getItem('selen.nav.expanded.member-1')).toBeNull()

    await user.clear(search)
    await user.type(search, 'manag')
    expect(within(nav).getByRole('link', { name: /Management/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /Mobile/ })).not.toBeInTheDocument()

    await user.type(search, 'zzz')
    expect(within(nav).getByText('Ничего не найдено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Очистить поиск' }))
    expect(search).toHaveValue('')
    expect(within(nav).getByRole('button', { name: /Mobile/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('без доступных пространств — подсказка, сотруднику без «+»', async () => {
    signedInAs(member)
    renderApp('/')

    const nav = await treeNav()
    expect(await within(nav).findByText('Нет доступных пространств')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить в дерево' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Администрирование' })).not.toBeInTheDocument()
  })

  it('системный администратор создаёт папку из «+» в корне дерева', async () => {
    signedInAs(admin)
    withTree()
    let body: unknown = null
    server.use(
      http.post('*/api/v1/admin/folders', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: [], meta: { max_depth: 4 } }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Добавить в дерево' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Папку' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новая папка' })
    expect(within(dialog).getByText('Папка появится в корне дерева.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Название'), 'Web')
    await user.click(within(dialog).getByRole('button', { name: '🌐' }))
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(body).toEqual({ name: 'Web', icon: '🌐', parent_id: null }))
    expect(await screen.findByText('Папка создана')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Новая папка' })).not.toBeInTheDocument(),
    )
  })

  it('системный администратор открывает создание пространства из «+»', async () => {
    signedInAs(admin)
    withTree()
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Добавить в дерево' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Пространство' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('панель сворачивается кнопкой и разворачивается разделом, состояние запоминается', async () => {
    signedInAs(member)
    withTree()
    const user = userEvent.setup()
    const { unmount } = renderApp('/')

    const panel = (await treeNav()).closest('.bg-sidebar')
    await user.click(screen.getByRole('button', { name: 'Свернуть панель' }))
    expect(panel).toHaveClass('md:hidden')
    expect(window.localStorage.getItem('selen.sidebar.collapsed')).toBe('true')

    unmount()
    renderApp('/')
    const collapsed = (await treeNav()).closest('.bg-sidebar')
    expect(collapsed).toHaveClass('md:hidden')
    await user.click(screen.getByRole('button', { name: 'Дерево' }))
    expect(collapsed).not.toHaveClass('md:hidden')
  })

  it('пустая папка (её присылают только Владельцу) — приглушённо, с пометкой «пустая»', async () => {
    signedInAs(makeUser({ id: 'owner-1', role: 'owner' }))
    withTree([
      {
        type: 'folder',
        id: 'f-new',
        name: 'Новые направления',
        icon: null,
        everyone: false,
        empty: true,
        children: [
          {
            type: 'folder',
            id: 'f-ideas',
            name: 'Идеи',
            icon: null,
            everyone: false,
            empty: true,
            children: [],
          },
        ],
      },
      ...tree,
    ])
    const user = userEvent.setup()
    renderApp('/')

    const nav = await treeNav()
    // У Владельца (системного администратора) в строке ещё кнопки «+» и «⋯» — берём саму папку
    const folder = await within(nav).findByRole('button', { name: /^Новые направления/ })
    expect(folder).toHaveTextContent('Новые направленияпустая')
    expect(
      within(folder).getByTitle(
        'В папке нет ни одного пространства. Такие папки в дереве видит только Владелец',
      ),
    ).toBeInTheDocument()
    await user.click(folder)
    const nested = await within(nav).findByRole('button', { name: /^Идеи/ })
    expect(nested).toHaveTextContent('Идеипустая')
    // Обычная папка — без пометки
    expect(within(nav).getByRole('button', { name: /Mobile$/ })).not.toHaveTextContent('пустая')
  })
})
