import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AdminNavNode, AdminNavigation } from '@/shared/types/api'
import { makeNavSpace, makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })

const folder = (id: string, name: string, overrides: Partial<AdminNavNode> = {}): AdminNavNode => ({
  id,
  parent_id: null,
  type: 'folder',
  name,
  icon: null,
  depth: 1,
  archived_at: null,
  everyone: false,
  space: null,
  ...overrides,
})

const space = (id: string, key: string, name: string, overrides: Partial<AdminNavNode> = {}) =>
  folder(id, '', {
    type: 'space',
    name: null,
    space: { id: `s-${key}`, key, name, archived_at: null },
    ...overrides,
  })

const nodes: AdminNavNode[] = [
  folder('f-mobile', 'Mobile', { icon: '📱', everyone: true }),
  space('n-ios', 'IOS', 'iOS', { parent_id: 'f-mobile', depth: 2, everyone: true }),
  folder('f-store', 'Магазины', { parent_id: 'f-mobile', depth: 2 }),
  space('n-andr', 'ANDR', 'Android', { parent_id: 'f-store', depth: 3 }),
  space('n-old-ios', 'OLDI', 'Старый iOS', {
    parent_id: 'f-mobile',
    depth: 2,
    space: { id: 's-OLDI', key: 'OLDI', name: 'Старый iOS', archived_at: '2026-10-01T00:00:00Z' },
  }),
  space('n-back', 'BACK', 'Backend'),
  space('n-mgmt', 'MGMT', 'Management', { icon: '📊' }),
  folder('f-old', 'Старое', { archived_at: '2026-10-01T00:00:00Z' }),
  space('n-legacy', 'LEG', 'Наследие', {
    parent_id: 'f-old',
    depth: 2,
    space: { id: 's-LEG', key: 'LEG', name: 'Наследие', archived_at: '2026-10-01T00:00:00Z' },
  }),
  folder('f-empty-old', 'Пустой архив', { archived_at: '2026-10-01T00:00:00Z' }),
  space('n-arch', 'ARCH', 'Архивное', {
    space: { id: 's-ARCH', key: 'ARCH', name: 'Архивное', archived_at: '2026-10-01T00:00:00Z' },
  }),
]

const navigation = (data: AdminNavNode[] = nodes): AdminNavigation => ({
  data,
  meta: { max_depth: 4 },
})

/** Запросы изменения: путь и тело. Ответ — то же дерево. */
function recordMutations() {
  const calls: { path: string; body: unknown }[] = []
  const record = async ({ request }: { request: Request }) => {
    const text = await request.text()
    calls.push({
      path: new URL(request.url).pathname.replace('/api/v1', ''),
      body: text ? JSON.parse(text) : null,
    })
    return HttpResponse.json(navigation())
  }
  server.use(
    http.post('*/api/v1/admin/nav-nodes/:id/move', record),
    http.patch('*/api/v1/admin/nav-nodes/:id', record),
    http.post('*/api/v1/admin/folders/:id/restore', record),
  )
  return calls
}

async function openMenu(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: `Действия с «${name}»` }))
  return user
}

describe('Админка: «Структура»', () => {
  beforeEach(() => {
    signedInAs(admin)
    server.use(http.get('*/api/v1/admin/navigation', () => HttpResponse.json(navigation())))
  })

  it('показывает дерево с ключами и значками, архивные пространства — на местах, архивные папки — отдельно', async () => {
    renderApp('/admin/structure')

    const tree = await screen.findByRole('region', { name: 'Структура' })
    const rows = await within(tree).findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Mobile'),
      expect.stringContaining('iOSIOS'),
      expect.stringContaining('Магазины'),
      expect.stringContaining('AndroidANDR'),
      'Старый iOSOLDIв архиве',
      expect.stringContaining('BackendBACK'),
      expect.stringContaining('ManagementMGMT'),
      'АрхивноеARCHв архиве',
    ])
    // Архивное пространство — без меню действий и без ссылки
    expect(within(rows[4]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(rows[4]).queryByRole('link')).not.toBeInTheDocument()
    expect(rows[4]).toHaveStyle({ paddingLeft: '36px' })
    expect(rows[0]).toHaveTextContent('Все пространства папки доступны всем сотрудникам')
    expect(rows[1]).toHaveTextContent('Доступно всем сотрудникам')
    expect(within(rows[1]).getByRole('link', { name: 'iOS' })).toHaveAttribute(
      'href',
      '/spaces/IOS',
    )

    const archived = screen.getByRole('region', { name: 'Архивные папки' })
    expect(within(archived).getByText('Старое')).toBeInTheDocument()
    expect(within(archived).getByText('Внутри в архиве: Наследие')).toBeInTheDocument()
    expect(within(tree).queryByText('Наследие')).not.toBeInTheDocument()
  })

  it('пометка «Не видно в вашем дереве» — у активных узлов, которых нет в дереве текущего пользователя', async () => {
    // В дереве администратора — только iOS в папке Mobile (у него доступ лишь туда)
    server.use(
      http.get('*/api/v1/navigation', () =>
        HttpResponse.json({
          data: [
            {
              type: 'folder',
              id: 'f-mobile',
              name: 'Mobile',
              icon: '📱',
              everyone: true,
              empty: false,
              children: [
                makeNavSpace(makeSpace({ id: 's-IOS', key: 'IOS', name: 'iOS' }), { id: 'n-ios' }),
              ],
            },
          ],
        }),
      ),
    )
    renderApp('/admin/structure')

    const tree = await screen.findByRole('region', { name: 'Структура' })
    const row = (text: string) =>
      within(tree)
        .getAllByRole('listitem')
        .find((item) => item.textContent?.includes(text))!
    const mark = (text: string) =>
      within(row(text)).queryByRole('img', { name: 'Не видно в вашем дереве' })
    await waitFor(() => expect(mark('Магазины')).toBeInTheDocument())
    for (const hidden of ['Магазины', 'AndroidANDR', 'BackendBACK', 'ManagementMGMT']) {
      expect(mark(hidden)).toBeInTheDocument()
    }
    for (const visible of ['Mobile', 'iOSIOS']) {
      expect(mark(visible)).not.toBeInTheDocument()
    }
    // Архивные помечены «в архиве» — второй пометки нет
    expect(mark('Старый iOS')).not.toBeInTheDocument()

    // Подсказка — всплывающая (не атрибут title): при наведении и при фокусе с клавиатуры (LATER-57)
    const user = userEvent.setup()
    const icon = mark('Магазины')!
    expect(icon).not.toHaveAttribute('title')
    await user.hover(icon)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Не видно в вашем дереве')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    act(() => icon.focus())
    expect(icon).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Не видно в вашем дереве')
  })

  it('удаление навсегда: пустая папка — с подтверждением, непустая — недоступно (LATER-43)', async () => {
    const empty = folder('f-empty', 'Пустая')
    server.use(
      http.get('*/api/v1/admin/navigation', () => HttpResponse.json(navigation([...nodes, empty]))),
    )
    let deleted: unknown = null
    server.use(
      http.delete('*/api/v1/admin/folders/:id', ({ params }) => {
        deleted = params.id
        return HttpResponse.json(navigation())
      }),
    )
    renderApp('/admin/structure')

    let user = await openMenu('Mobile')
    expect(await screen.findByRole('menuitem', { name: 'Удалить навсегда…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.keyboard('{Escape}')

    user = await openMenu('Пустая')
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить навсегда…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить папку навсегда?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить навсегда' }))

    expect(await screen.findByText('Папка удалена')).toBeInTheDocument()
    expect(deleted).toBe('f-empty')
  })

  it('«Переместить в…»: папку нельзя в себя и во вложенную, перемещение — в выбранную папку', async () => {
    const calls = recordMutations()
    renderApp('/admin/structure')

    const user = await openMenu('Mobile')
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить в…' }))
    let dialog = await screen.findByRole('dialog', { name: 'Переместить «Mobile»' })
    expect(within(dialog).getByRole('option', { name: /Mobile/ })).toBeDisabled()
    expect(within(dialog).getByRole('option', { name: /Магазины/ })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Переместить' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))

    await user.click(await screen.findByRole('button', { name: 'Действия с «Backend»' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить в…' }))
    dialog = await screen.findByRole('dialog', { name: 'Переместить «Backend»' })
    expect(
      within(dialog).getByText(
        'Ключ пространства, номера карточек, история и доступы не меняются.',
      ),
    ).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Куда'), 'f-store')
    await user.click(within(dialog).getByRole('button', { name: 'Переместить' }))

    await waitFor(() =>
      expect(calls).toEqual([
        { path: '/admin/nav-nodes/n-back/move', body: { parent_id: 'f-store' } },
      ]),
    )
    expect(await screen.findByText('Перемещено')).toBeInTheDocument()
  })

  it('слишком глубокая папка недоступна для перемещения', async () => {
    const deep = [
      folder('a', 'A'),
      folder('b', 'B', { parent_id: 'a', depth: 2 }),
      folder('c', 'C', { parent_id: 'b', depth: 3 }),
      folder('d', 'D', { parent_id: 'c', depth: 4 }),
      folder('x', 'X'),
      folder('y', 'Y', { parent_id: 'x', depth: 2 }),
    ]
    server.use(http.get('*/api/v1/admin/navigation', () => HttpResponse.json(navigation(deep))))
    renderApp('/admin/structure')

    const user = await openMenu('X')
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить в…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Переместить «X»' })
    // X с вложенной Y — высота 2: в C (уровень 3) и D (уровень 4) не помещается
    expect(within(dialog).getByRole('option', { name: /B/ })).toBeEnabled()
    expect(within(dialog).getByRole('option', { name: /C/ })).toBeDisabled()
    expect(within(dialog).getByRole('option', { name: /D/ })).toBeDisabled()

    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Действия с «D»' }))
    expect(await screen.findByRole('menuitem', { name: 'Вложенная папка…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('«Выше» и «Ниже» переставляют среди соседей той же папки', async () => {
    const calls = recordMutations()
    renderApp('/admin/structure')

    let user = await openMenu('Backend')
    await user.click(await screen.findByRole('menuitem', { name: 'Ниже' }))
    await waitFor(() => expect(calls).toHaveLength(1))

    user = await openMenu('Backend')
    await user.click(await screen.findByRole('menuitem', { name: 'Выше' }))
    await waitFor(() => expect(calls).toHaveLength(2))

    expect(calls).toEqual([
      { path: '/admin/nav-nodes/n-back/move', body: { parent_id: null, after_id: 'n-mgmt' } },
      { path: '/admin/nav-nodes/n-back/move', body: { parent_id: null, before_id: 'f-mobile' } },
    ])

    // Первый и последний в своей папке
    user = await openMenu('iOS')
    expect(await screen.findByRole('menuitem', { name: 'Выше' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.keyboard('{Escape}')
    await openMenu('Management')
    expect(await screen.findByRole('menuitem', { name: 'Ниже' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('папка переименовывается с иконкой; неверная иконка — ошибка под полем', async () => {
    const calls = recordMutations()
    renderApp('/admin/structure')

    const user = await openMenu('Mobile')
    await user.click(await screen.findByRole('menuitem', { name: 'Изменить…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Папка «Mobile»' })
    const name = within(dialog).getByLabelText('Название')
    const icon = within(dialog).getByLabelText('Иконка')
    expect(name).toHaveValue('Mobile')
    expect(icon).toHaveValue('📱')

    await user.clear(name)
    await user.type(name, 'Мобильные')
    await user.clear(icon)
    await user.type(icon, 'ab')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await within(dialog).findByText('Иконка — одна эмодзи')).toBeInTheDocument()
    expect(calls).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: 'Без иконки' }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(calls).toEqual([
        { path: '/admin/nav-nodes/f-mobile', body: { name: 'Мобильные', icon: null } },
      ]),
    )
    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument()
  })

  it('у пространства меняется только иконка', async () => {
    const calls = recordMutations()
    renderApp('/admin/structure')

    const user = await openMenu('Management')
    await user.click(await screen.findByRole('menuitem', { name: 'Иконка…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Иконка «Management»' })
    expect(within(dialog).queryByLabelText('Название')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '💡' }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(calls).toEqual([{ path: '/admin/nav-nodes/n-mgmt', body: { icon: '💡' } }]),
    )
  })

  it('ошибка сервера при сохранении — сообщение, а не поле', async () => {
    server.use(
      http.post('*/api/v1/admin/folders', () =>
        HttpResponse.json(
          {
            message: 'Папка в архиве',
            errors: { parent_id: ['Папка в архиве'] },
          },
          { status: 422 },
        ),
      ),
    )
    renderApp('/admin/structure')

    const user = await openMenu('Магазины')
    await user.click(await screen.findByRole('menuitem', { name: 'Вложенная папка…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая папка' })
    expect(within(dialog).getByText('Папка появится в «Магазины».')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Название'), 'Huawei')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Папка в архиве')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })

  it('архивирование с подтверждением; 422 «сначала перенесите содержимое» — сообщением', async () => {
    let archived = 0
    server.use(
      http.post('*/api/v1/admin/folders/:id/archive', () => {
        archived++
        return HttpResponse.json(
          { message: 'Сначала перенесите содержимое: iOS', errors: { folder: ['…'] } },
          { status: 422 },
        )
      }),
    )
    renderApp('/admin/structure')

    const user = await openMenu('Mobile')
    await user.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    const confirm = await screen.findByRole('dialog', { name: 'Архивировать папку?' })
    expect(within(confirm).getByText(/«Mobile» исчезнет из дерева/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Архивировать' }))

    expect(await screen.findByText('Сначала перенесите содержимое: iOS')).toBeInTheDocument()
    expect(archived).toBe(1)
  })

  it('пустая архивная папка восстанавливается сразу', async () => {
    const calls = recordMutations()
    const user = userEvent.setup()
    renderApp('/admin/structure')

    const archivedSection = await screen.findByRole('region', { name: 'Архивные папки' })
    const row = (await within(archivedSection).findByText('Пустой архив')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Восстановить' }))
    await waitFor(() =>
      expect(calls).toEqual([
        { path: '/admin/folders/f-empty-old/restore', body: { restore_spaces: false } },
      ]),
    )
    expect(await screen.findByText('Папка восстановлена')).toBeInTheDocument()
  })

  it('папка с архивными пространствами — диалог с галочкой, по умолчанию выключенной', async () => {
    const calls = recordMutations()
    const user = userEvent.setup()
    renderApp('/admin/structure')

    const archivedSection = await screen.findByRole('region', { name: 'Архивные папки' })
    const row = (await within(archivedSection).findByText('Старое')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Восстановить' }))

    let dialog = await screen.findByRole('dialog', { name: 'Восстановить папку «Старое»?' })
    const checkbox = within(dialog).getByRole('checkbox', {
      name: 'Восстановить также пространства внутри (1)',
    })
    expect(checkbox).not.toBeChecked()
    expect(within(dialog).getByText(/^Наследие\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    await waitFor(() =>
      expect(calls).toEqual([
        { path: '/admin/folders/f-old/restore', body: { restore_spaces: false } },
      ]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(within(row).getByRole('button', { name: 'Восстановить' }))
    dialog = await screen.findByRole('dialog', { name: 'Восстановить папку «Старое»?' })
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        path: '/admin/folders/f-old/restore',
        body: { restore_spaces: true },
      }),
    )
    expect(await screen.findByText('Папка и пространства восстановлены')).toBeInTheDocument()
  })

  it('пустое дерево — подсказка и нет архивных', async () => {
    server.use(http.get('*/api/v1/admin/navigation', () => HttpResponse.json(navigation([]))))
    renderApp('/admin/structure')

    expect(await screen.findByText('В дереве пока ничего нет')).toBeInTheDocument()
    expect(screen.getByText('Архивных папок нет')).toBeInTheDocument()
  })
})
