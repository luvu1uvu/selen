import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminNavNode, NavTreeNode, User } from '@/shared/types/api'
import { makeBoardDetail } from '@/test/boards'
import { makeNavSpace, makeSpace, makeUser, navTree, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const sysAdmin = makeUser({ id: 'admin-1', name: 'Сергей' })
const spaceAdmin = makeUser({ id: 'anna', name: 'Анна', role: 'member' })
const reader = makeUser({ id: 'ivan', name: 'Иван', role: 'member' })

const ios = makeSpace({ id: 's-IOS', key: 'IOS', name: 'iOS' })
const android = makeSpace({ id: 's-AND', key: 'AND', name: 'Android' })
const mgmt = makeSpace({ id: 's-MGMT', key: 'MGMT', name: 'Management' })

/** Дерево глазами пользователя: iOS он администрирует (canManageIos), остальное — нет. */
function treeFor(canManageIos: boolean): NavTreeNode[] {
  return [
    {
      type: 'folder',
      id: 'f-mobile',
      name: 'Mobile',
      icon: null,
      everyone: false,
      empty: false,
      children: [makeNavSpace(android, { can_manage: false })],
    },
    makeNavSpace(ios, { can_manage: canManageIos }),
    makeNavSpace(mgmt, { can_manage: false }),
  ]
}

const node = (overrides: Partial<AdminNavNode> & Pick<AdminNavNode, 'id'>): AdminNavNode => ({
  parent_id: null,
  type: 'space',
  name: null,
  icon: null,
  depth: 1,
  archived_at: null,
  everyone: false,
  space: null,
  ...overrides,
})

const structure: AdminNavNode[] = [
  node({ id: 'f-mobile', type: 'folder', name: 'Mobile' }),
  node({
    id: 'node-AND',
    parent_id: 'f-mobile',
    depth: 2,
    space: { id: 's-AND', key: 'AND', name: 'Android', archived_at: null },
  }),
  node({ id: 'node-IOS', space: { id: 's-IOS', key: 'IOS', name: 'iOS', archived_at: null } }),
  node({
    id: 'node-MGMT',
    space: { id: 's-MGMT', key: 'MGMT', name: 'Management', archived_at: null },
  }),
]

function serve(user: User, canManageIos: boolean) {
  signedInAs(user)
  server.use(
    http.get('*/api/v1/navigation', () => HttpResponse.json(navTree(treeFor(canManageIos)))),
    http.get('*/api/v1/admin/companies/:company/navigation', () =>
      HttpResponse.json({ data: structure, meta: { max_depth: 4 } }),
    ),
  )
}

async function openTree() {
  const nav = await screen.findByRole('navigation', { name: 'Дерево' })
  await within(nav).findByRole('button', { name: /Mobile$/ })
  return nav
}

/** Пункты открытого меню. */
async function menuItems(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  await user.click(button)
  const menu = await screen.findByRole('menu')
  const items = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent)
  await user.keyboard('{Escape}')
  return items
}

describe('Дерево: кнопки «+» и «⋯» у строки', () => {
  beforeEach(() => window.localStorage.clear())

  it('подсказка «+» и «⋯» — Tooltip по наведению, а не атрибут title (правило 8, LATER-88)', async () => {
    serve(sysAdmin, true)
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    for (const name of ['Добавить в «Mobile»', 'Меню «Mobile»']) {
      const button = await within(nav).findByRole('button', { name })
      expect(button).not.toHaveAttribute('title')
      await user.hover(button)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(name)
      // jsdom не знает размеров: уход указателя Radix считает уходом на подсказку — закрываем Esc
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    }
  })

  it('системному администратору — меню папки и пространства; «Доску» — только где он админ', async () => {
    serve(sysAdmin, true)
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Меню «Mobile»' })).toBeInTheDocument(),
    )
    expect(
      await menuItems(user, within(nav).getByRole('button', { name: 'Добавить в «Mobile»' })),
    ).toEqual(['Папку', 'Пространство'])
    expect(
      await menuItems(user, within(nav).getByRole('button', { name: 'Меню «Mobile»' })),
    ).toEqual([
      'Переименовать',
      'Изменить иконку',
      'Доступ…',
      'Переместить в…',
      'Выше',
      'Ниже',
      'Архивировать',
      'Удалить навсегда…',
    ])

    expect(
      await menuItems(user, within(nav).getByRole('button', { name: 'Добавить в «iOS»' })),
    ).toEqual(['Доску'])
    expect(await menuItems(user, within(nav).getByRole('button', { name: 'Меню «iOS»' }))).toEqual([
      'Изменить иконку',
      'Доступ…',
      'Переместить в…',
      'Выше',
      'Ниже',
      'Архивировать',
      'Удалить навсегда…',
    ])

    // Management он не администрирует: «+» нет, «⋯» есть
    expect(within(nav).queryByRole('button', { name: 'Добавить в «Management»' })).toBeNull()
    expect(within(nav).getByRole('button', { name: 'Меню «Management»' })).toBeInTheDocument()
  })

  it('администратору пространства — только «+» → «Доску» у своего пространства', async () => {
    serve(spaceAdmin, true)
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    expect(
      await menuItems(user, within(nav).getByRole('button', { name: 'Добавить в «iOS»' })),
    ).toEqual(['Доску'])
    for (const name of ['Mobile', 'iOS', 'Management']) {
      expect(within(nav).queryByRole('button', { name: `Меню «${name}»` })).toBeNull()
    }
    expect(within(nav).queryByRole('button', { name: 'Добавить в «Mobile»' })).toBeNull()
    expect(within(nav).queryByRole('button', { name: 'Добавить в «Management»' })).toBeNull()

    // «Доску» — существующий диалог создания доски
    await user.click(within(nav).getByRole('button', { name: 'Добавить в «iOS»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Доску' }))
    expect(await screen.findByRole('dialog', { name: 'Новая доска' })).toBeInTheDocument()
  })

  it('обычному пользователю кнопок нет', async () => {
    serve(reader, false)
    renderApp('/')
    const nav = await openTree()

    expect(within(nav).queryByRole('button', { name: /^Добавить в «/ })).toBeNull()
    expect(within(nav).queryByRole('button', { name: /^Меню «/ })).toBeNull()
  })

  it('«+» на папке создаёт пространство и папку сразу в ней', async () => {
    serve(sysAdmin, true)
    const bodies: Record<string, unknown> = {}
    server.use(
      http.post('*/api/v1/admin/companies/:company/spaces', async ({ request }) => {
        bodies.space = await request.json()
        return HttpResponse.json({ data: {} }, { status: 201 })
      }),
      http.post('*/api/v1/admin/companies/:company/folders', async ({ request }) => {
        bodies.folder = await request.json()
        return HttpResponse.json({ data: structure, meta: { max_depth: 4 } }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    await user.click(await within(nav).findByRole('button', { name: 'Добавить в «Mobile»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Пространство' }))
    let dialog = await screen.findByRole('dialog', { name: 'Новое пространство' })
    expect(within(dialog).getByText('Оно появится в папке «Mobile».')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Название'), 'Huawei')
    await user.type(within(dialog).getByLabelText('Ключ'), 'hw')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))
    await waitFor(() =>
      expect(bodies.space).toMatchObject({ name: 'Huawei', key: 'HW', parent_id: 'f-mobile' }),
    )

    await user.click(within(nav).getByRole('button', { name: 'Добавить в «Mobile»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Папку' }))
    dialog = await screen.findByRole('dialog', { name: 'Новая папка' })
    expect(within(dialog).getByText('Папка появится в «Mobile».')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Название'), 'Планшеты')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))
    await waitFor(() =>
      expect(bodies.folder).toEqual({ name: 'Планшеты', icon: null, parent_id: 'f-mobile' }),
    )
  })

  it('«⋯»: выше/ниже — те же запросы, что в «Структуре»; архив непустой папки — ошибка со списком', async () => {
    serve(sysAdmin, true)
    const moves: unknown[] = []
    server.use(
      http.post(
        '*/api/v1/admin/companies/:company/nav-nodes/:id/move',
        async ({ params, request }) => {
          moves.push({ id: params.id, ...((await request.json()) as object) })
          return HttpResponse.json({ data: structure, meta: { max_depth: 4 } })
        },
      ),
      http.post('*/api/v1/admin/companies/:company/folders/:id/archive', () =>
        HttpResponse.json(
          { message: 'Сначала перенесите содержимое: Android', errors: { node: ['…'] } },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    await user.click(await within(nav).findByRole('button', { name: 'Меню «Management»' }))
    expect(await screen.findByRole('menuitem', { name: 'Ниже' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('menuitem', { name: 'Выше' }))
    await waitFor(() =>
      expect(moves).toEqual([{ id: 'node-MGMT', parent_id: null, before_id: 'node-IOS' }]),
    )

    await user.click(within(nav).getByRole('button', { name: 'Меню «Mobile»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    const confirm = await screen.findByRole('dialog', { name: 'Архивировать папку?' })
    await user.click(within(confirm).getByRole('button', { name: 'Архивировать' }))
    expect(await screen.findByText('Сначала перенесите содержимое: Android')).toBeInTheDocument()
  })

  it('«⋯» пространства: архив и удаление навсегда — с подтверждением, теми же запросами, что в админке (LATER-43)', async () => {
    serve(sysAdmin, true)
    const requests: string[] = []
    server.use(
      http.post('*/api/v1/admin/companies/:company/spaces/:id/archive', ({ params }) => {
        requests.push(`archive ${params.id}`)
        return HttpResponse.json({ data: { ...ios, archived_at: '2026-10-15T07:00:00Z' } })
      }),
      http.delete('*/api/v1/admin/companies/:company/spaces/:id', ({ params }) => {
        requests.push(`delete ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    await user.click(within(nav).getByRole('button', { name: 'Меню «iOS»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    const archive = await screen.findByRole('dialog', { name: 'Архивировать пространство?' })
    await user.click(within(archive).getByRole('button', { name: 'Архивировать' }))
    expect(await screen.findByText('Пространство архивировано')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Меню «iOS»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить навсегда…' }))
    const remove = await screen.findByRole('dialog', { name: 'Удалить пространство навсегда?' })
    expect(remove).toHaveTextContent('без возможности восстановления')
    await user.click(within(remove).getByRole('button', { name: 'Удалить навсегда' }))
    expect(await screen.findByText('Пространство удалено')).toBeInTheDocument()

    expect(requests).toEqual(['archive s-IOS', 'delete s-IOS'])
  })

  it('удаление пространства, на доске которого стоишь: доска перечитывается — на главную с уведомлением (LATER-43)', async () => {
    serve(sysAdmin, true)
    let deleted = false
    server.use(
      http.get('*/api/v1/boards/board-1', () =>
        deleted
          ? HttpResponse.json({ message: 'Не найдено.' }, { status: 404 })
          : HttpResponse.json({ data: makeBoardDetail() }),
      ),
      http.delete('*/api/v1/admin/companies/:company/spaces/:id', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/boards/board-1')
    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    const nav = await openTree()

    await user.click(within(nav).getByRole('button', { name: 'Меню «iOS»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить навсегда…' }))
    const remove = await screen.findByRole('dialog', { name: 'Удалить пространство навсегда?' })
    await user.click(within(remove).getByRole('button', { name: 'Удалить навсегда' }))

    expect(await screen.findByText('Нет доступа к доске или она не существует')).toBeInTheDocument()
  })

  it('«⋯» папки: «Удалить навсегда…» недоступно — в дереве видны только непустые папки (LATER-43)', async () => {
    serve(sysAdmin, true)
    const user = userEvent.setup()
    renderApp('/')
    const nav = await openTree()

    await user.click(within(nav).getByRole('button', { name: 'Меню «Mobile»' }))
    const remove = await screen.findByRole('menuitem', { name: 'Удалить навсегда…' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAttribute(
      'title',
      expect.stringContaining('«Администрирование → Структура»'),
    )
  })

  it('«Папку» недоступна в папке на пределе глубины', async () => {
    const deep: NavTreeNode = {
      type: 'folder',
      id: 'f-1',
      name: 'Уровень 1',
      icon: null,
      everyone: false,
      empty: false,
      children: [2, 3, 4].reduceRight<NavTreeNode[]>(
        (children, level) => [
          {
            type: 'folder',
            id: `f-${level}`,
            name: `Уровень ${level}`,
            icon: null,
            everyone: false,
            empty: false,
            children,
          },
        ],
        [],
      ),
    }
    signedInAs(sysAdmin)
    server.use(http.get('*/api/v1/navigation', () => HttpResponse.json(navTree([deep]))))
    window.localStorage.setItem('selen.nav.expanded.admin-1', JSON.stringify(['f-1', 'f-2', 'f-3']))
    const user = userEvent.setup()
    renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Дерево' })

    await user.click(await within(nav).findByRole('button', { name: 'Добавить в «Уровень 3»' }))
    expect(await screen.findByRole('menuitem', { name: 'Папку' })).not.toHaveAttribute(
      'aria-disabled',
    )
    await user.keyboard('{Escape}')
    await user.click(within(nav).getByRole('button', { name: 'Добавить в «Уровень 4»' }))
    expect(await screen.findByRole('menuitem', { name: 'Папку' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
