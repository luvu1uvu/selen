import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeBoardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const twoLanes = makeBoardDetail({
  lanes: [
    { id: 'main', name: 'Основная', position: 'a0' },
    { id: 'urgent', name: 'Срочные', position: 'a1' },
  ],
})

describe('Структура доски через меню', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member' }))
    server.use(http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: twoLanes })))
  })

  it('переставляет колонки и подколонки влево/вправо по соседям', async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    server.use(
      http.post('*/api/v1/columns/:id/move', async ({ request }) => {
        requests.push({ url: new URL(request.url).pathname, body: await request.json() })
        return HttpResponse.json({ data: {} })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Действия с колонкой Done' }))
    expect(await screen.findByRole('menuitem', { name: 'Правее' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Левее' }))

    await userEvent.click(screen.getByRole('button', { name: 'Действия с колонкой Dev' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Правее' }))

    await vi.waitFor(() =>
      expect(requests).toEqual([
        { url: '/api/v1/columns/done/move', body: { before_id: 'progress' } },
        { url: '/api/v1/columns/dev/move', body: { after_id: 'qa' } },
      ]),
    )
  })

  it('дорожки: переименовать, переставить, архивировать', async () => {
    const calls: string[] = []
    server.use(
      http.patch('*/api/v1/lanes/urgent', async ({ request }) => {
        calls.push(`rename:${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ data: {} })
      }),
      http.post('*/api/v1/lanes/urgent/move', async ({ request }) => {
        calls.push(`move:${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ data: {} })
      }),
      http.post('*/api/v1/lanes/urgent/archive', () => {
        calls.push('archive')
        return HttpResponse.json({ data: {} })
      }),
    )
    renderApp('/boards/board-1')

    const menu = await screen.findByRole('button', { name: 'Действия с дорожкой Срочные' })
    await userEvent.click(menu)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    const name = screen.getByLabelText('Название')
    await userEvent.clear(name)
    await userEvent.type(name, 'Горящие')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByText('Сохранено')

    await userEvent.click(menu)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Выше' }))

    await userEvent.click(menu)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Архивировать' }),
    )

    await vi.waitFor(() =>
      expect(calls).toEqual(['rename:{"name":"Горящие"}', 'move:{"before_id":"main"}', 'archive']),
    )
    expect(screen.getByRole('group', { name: 'To Do / Срочные' })).toBeInTheDocument()
  })

  it('переименование колонки и доски, добавление дорожки', async () => {
    const calls: string[] = []
    server.use(
      http.patch('*/api/v1/columns/todo', async ({ request }) => {
        calls.push(`column:${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ data: {} })
      }),
      http.patch('*/api/v1/boards/board-1', async ({ request }) => {
        calls.push(`board:${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ data: {} })
      }),
      http.post('*/api/v1/boards/board-1/lanes', async ({ request }) => {
        calls.push(`lane:${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ data: {} }, { status: 201 })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Действия с колонкой To Do' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    await userEvent.clear(screen.getByLabelText('Название'))
    await userEvent.type(screen.getByLabelText('Название'), 'Очередь')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByText('Сохранено')

    await userEvent.click(screen.getByRole('button', { name: 'Действия с доской' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать доску' }))
    await userEvent.clear(screen.getByLabelText('Название'))
    await userEvent.type(screen.getByLabelText('Название'), 'Продукт 2')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await userEvent.click(screen.getByRole('button', { name: 'Действия с доской' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Добавить дорожку' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Баги')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить дорожку' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        'column:{"name":"Очередь"}',
        'board:{"name":"Продукт 2"}',
        'lane:{"name":"Баги"}',
      ]),
    )
  })

  it('админ пространства выключает автоназначение в настройках доски', async () => {
    let body: unknown
    server.use(
      http.patch('*/api/v1/boards/board-1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: {} })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Действия с доской' }))
    const toggle = await screen.findByRole('menuitemcheckbox', {
      name: 'Автоназначение при переходе в работу',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(toggle)

    expect(await screen.findByText('Автоназначение выключено')).toBeInTheDocument()
    expect(body).toEqual({ auto_assign_on_move: false })
  })

  it('администратор меняет и стирает описание доски через «⋯»; стёрли — ⓘ пропал (LATER-64)', async () => {
    let board = makeBoardDetail({ description: 'Старые правила' })
    const bodies: unknown[] = []
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })),
      http.patch('*/api/v1/boards/board-1', async ({ request }) => {
        const body = (await request.json()) as { description: string | null }
        bodies.push(body)
        board = { ...board, description: body.description }
        return HttpResponse.json({ data: {} })
      }),
    )
    renderApp('/boards/board-1')

    // Изменить: поле — с текущим описанием
    await userEvent.click(await screen.findByRole('button', { name: 'Действия с доской' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Изменить описание' }))
    let dialog = await screen.findByRole('dialog', { name: 'Описание доски' })
    const field = within(dialog).getByLabelText('Описание')
    expect(field).toHaveValue('Старые правила')
    await userEvent.clear(field)
    await userEvent.type(field, 'Новые правила{Enter}вторая строка')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Описание сохранено')).toBeInTheDocument()
    expect(bodies[0]).toEqual({ description: 'Новые правила\nвторая строка' })
    await userEvent.click(await screen.findByRole('button', { name: 'Описание доски' }))
    expect(await screen.findByText(/Новые правила/)).toHaveTextContent('вторая строка')
    await userEvent.keyboard('{Escape}')

    // Стереть: пустое поле — описания нет, значок ⓘ пропадает
    await userEvent.click(screen.getByRole('button', { name: 'Действия с доской' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Изменить описание' }))
    dialog = await screen.findByRole('dialog', { name: 'Описание доски' })
    await userEvent.clear(within(dialog).getByLabelText('Описание'))
    await userEvent.type(within(dialog).getByLabelText('Описание'), '   ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Описание удалено')).toBeInTheDocument()
    expect(bodies[1]).toEqual({ description: null })
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Описание доски' })).not.toBeInTheDocument(),
    )
  })

  it('без права менять структуру пункта «Изменить описание» нет (LATER-64)', async () => {
    server.use(
      http.get('*/api/v1/boards/board-1', () =>
        HttpResponse.json({
          data: makeBoardDetail({
            description: 'Правила',
            permissions: { manage: false, edit_cards: true, delete_cards: false },
          }),
        }),
      ),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Действия с доской' }))
    expect(await screen.findByRole('menuitem', { name: 'Архив карточек' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Изменить описание' })).not.toBeInTheDocument()
  })
})
