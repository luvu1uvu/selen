import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminNavNode, NavTreeNode } from '@/shared/types/api'
import { makeNavSpace, makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })

/** Сервер с состоянием: корень из трёх пространств, «Выше»/«Ниже» переставляют их. */
function statefulServer() {
  const spaces = ['ONE', 'TWO', 'THREE'].map((key) =>
    makeSpace({ id: `s-${key}`, key, name: `Пространство ${key}` }),
  )
  let order = spaces.map((space) => space.key)
  const folders: string[] = []
  const folderNode = (name: string): AdminNavNode => ({
    id: `f-${name}`,
    parent_id: null,
    type: 'folder',
    name,
    icon: null,
    depth: 1,
    archived_at: null,
    everyone: false,
    space: null,
  })
  const adminNodes = (): AdminNavNode[] => [
    ...order.map((key): AdminNavNode => ({
      id: `node-${key}`,
      parent_id: null,
      type: 'space',
      name: null,
      icon: null,
      depth: 1,
      archived_at: null,
      everyone: false,
      space: { id: `s-${key}`, key, name: `Пространство ${key}`, archived_at: null },
    })),
    ...folders.map(folderNode),
  ]
  // Дерево — только пространства (пустые папки в него не приходят никому, ADR-0013)
  const tree = (): NavTreeNode[] =>
    order.map((key) => makeNavSpace(spaces.find((space) => space.key === key)!))

  server.use(
    http.get('*/api/v1/navigation', () => HttpResponse.json({ data: tree() })),
    http.get('*/api/v1/admin/navigation', () =>
      HttpResponse.json({ data: adminNodes(), meta: { max_depth: 4 } }),
    ),
    http.post('*/api/v1/admin/folders', async ({ request }) => {
      folders.push(((await request.json()) as { name: string }).name)
      return HttpResponse.json({ data: adminNodes(), meta: { max_depth: 4 } }, { status: 201 })
    }),
    http.post('*/api/v1/admin/nav-nodes/:id/move', async ({ params, request }) => {
      const body = (await request.json()) as { after_id?: string; before_id?: string }
      const key = String(params.id).replace('node-', '')
      order = order.filter((item) => item !== key)
      const neighbour = (body.after_id ?? body.before_id ?? '').replace('node-', '')
      const index = order.indexOf(neighbour) + (body.after_id ? 1 : 0)
      order.splice(index, 0, key)
      return HttpResponse.json({ data: adminNodes(), meta: { max_depth: 4 } })
    }),
  )
}

const treeLinks = () =>
  within(screen.getByRole('navigation', { name: 'Дерево' }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))

describe('«Структура» и дерево в сайдбаре', () => {
  beforeEach(() => {
    window.localStorage.clear()
    signedInAs(admin)
    statefulServer()
  })

  it('перемещение в «Структуре» сразу отражается в открытом дереве', async () => {
    const user = userEvent.setup()
    // Раздел по умолчанию — «Дерево»: оно открыто рядом со «Структурой»
    renderApp('/admin/structure')

    await waitFor(() =>
      expect(treeLinks()).toEqual(['/spaces/ONE', '/spaces/TWO', '/spaces/THREE']),
    )

    // Дерево (каркас) видно раньше страницы «Структура» — её код грузится отдельно (HydrateFallback)
    await user.click(await screen.findByRole('button', { name: 'Действия с «Пространство THREE»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Выше' }))

    await waitFor(() =>
      expect(treeLinks()).toEqual(['/spaces/ONE', '/spaces/THREE', '/spaces/TWO']),
    )
  })

  it('дерево, открытое после перемещения, показывает новый порядок', async () => {
    const user = userEvent.setup()
    renderApp('/spaces/ONE')
    server.use(
      http.get('*/api/v1/spaces/ONE', () => HttpResponse.json({ data: makeSpace({ key: 'ONE' }) })),
    )
    await waitFor(() =>
      expect(treeLinks()).toEqual(['/spaces/ONE', '/spaces/TWO', '/spaces/THREE']),
    )

    // Раздел «Администрирование» → «Структура»: дерево в сайдбаре закрыто
    await user.click(screen.getByRole('button', { name: 'Администрирование' }))
    await user.click(await screen.findByRole('link', { name: 'Структура' }))
    await user.click(await screen.findByRole('button', { name: 'Действия с «Пространство ONE»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ниже' }))

    await user.click(screen.getByRole('button', { name: 'Дерево' }))
    await waitFor(() =>
      expect(treeLinks()).toEqual(['/spaces/TWO', '/spaces/ONE', '/spaces/THREE']),
    )
  })

  it('созданная пустая папка видна в «Структуре», но не в дереве', async () => {
    const user = userEvent.setup()
    renderApp('/admin/structure')
    const nav = await screen.findByRole('navigation', { name: 'Дерево' })
    await waitFor(() => expect(treeLinks()).toHaveLength(3))

    await user.click(screen.getByRole('button', { name: 'Создать папку' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая папка' })
    await user.type(within(dialog).getByLabelText('Название'), 'Архитектура')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const structure = screen.getByRole('region', { name: 'Структура' })
    expect(await within(structure).findByText('Архитектура')).toBeInTheDocument()
    expect(within(nav).queryByText('Архитектура')).not.toBeInTheDocument()
    expect(treeLinks()).toHaveLength(3)
  })
})
