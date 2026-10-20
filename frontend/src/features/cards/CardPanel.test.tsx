import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { BoardSummary } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const boards: BoardSummary[] = [
  {
    id: 'board-1',
    space_id: 'space-1',
    row_id: 'row-1',
    name: 'Продукт',
    description: null,
    position: 'a0',
    archived_at: null,
  },
  {
    id: 'board-2',
    space_id: 'space-1',
    row_id: 'row-1',
    name: 'Релизы',
    description: null,
    position: 'a1',
    archived_at: null,
  },
]

const releases = makeBoardDetail({
  id: 'board-2',
  name: 'Релизы',
  columns: [
    { id: 'r-todo', parent_id: null, name: 'План', category: 'queue', position: 'a0' },
    { id: 'r-done', parent_id: null, name: 'Выпущено', category: 'done', position: 'a1' },
  ],
  lanes: [{ id: 'r-main', name: 'Основная', position: 'a0' }],
  cards: [],
})

describe('Панель карточки', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/boards/board-2', () => HttpResponse.json({ data: releases })),
      http.get('*/api/v1/spaces/DEV/boards', () => HttpResponse.json({ data: boards })),
      http.get('*/api/v1/cards/DEV-1/history', () => HttpResponse.json(makeCardHistory())),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
      http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: makeCardDetail() })),
    )
  })

  it('меняет тип', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('*/api/v1/cards/DEV-1', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: makeCardDetail() })
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await within(panel).findByRole('option', { name: 'Баг' })
    await userEvent.selectOptions(within(panel).getByLabelText('Тип'), 'bug')

    await vi.waitFor(() => expect(bodies).toEqual([{ card_type_id: 'bug' }]))
  })

  it('перемещает на другую доску пространства: колонки и дорожки — выбранной доски', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/cards/DEV-1/move', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          data: makeCardDetail({ board: { id: 'board-2', name: 'Релизы' } }),
        })
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('button', { name: 'Переместить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Переместить DEV-1' })
    // Колонки текущей доски: подколонки показываются с родителем
    expect(
      await within(dialog).findByRole('option', { name: 'In Progress / Dev' }),
    ).toBeInTheDocument()

    await userEvent.selectOptions(within(dialog).getByLabelText('Доска'), 'board-2')
    expect(await within(dialog).findByRole('option', { name: 'Выпущено' })).toBeInTheDocument()
    await userEvent.selectOptions(within(dialog).getByLabelText('Колонка'), 'r-done')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Переместить' }))

    expect(await screen.findByText('Карточка перемещена')).toBeInTheDocument()
    expect(body).toEqual({ board_id: 'board-2', column_id: 'r-done', lane_id: 'r-main' })
  })

  it('архивирует; архивная карточка только для чтения, её можно восстановить', async () => {
    const calls: string[] = []
    server.use(
      http.post('*/api/v1/cards/DEV-1/archive', () => {
        calls.push('archive')
        return HttpResponse.json({ data: makeCardDetail({ archived_at: '2026-10-02T00:00:00Z' }) })
      }),
      http.post('*/api/v1/cards/DEV-1/restore', () => {
        calls.push('restore')
        return HttpResponse.json({ data: makeCardDetail() })
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('button', { name: 'Архивировать' }))
    expect(await screen.findByText('Карточка архивирована')).toBeInTheDocument()
    expect(within(panel).getByText('Карточка в архиве')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Название')).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: 'Переместить' })).not.toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Карточка восстановлена')).toBeInTheDocument()
    expect(calls).toEqual(['archive', 'restore'])
  })

  it('без права правки — только просмотр', async () => {
    server.use(
      http.get('*/api/v1/cards/DEV-1', () =>
        HttpResponse.json({
          data: makeCardDetail({
            permissions: { edit: false, comment: true, restricted: false, delete: false },
          }),
        }),
      ),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByLabelText('Название')).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: 'Архивировать' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Скопировать ссылку' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Удалить…' })).not.toBeInTheDocument()
  })

  it('системный администратор удаляет карточку в корзину после подтверждения — панель закрывается', async () => {
    let deleted = 0
    let fetchedAfterDelete = 0
    server.use(
      http.get('*/api/v1/cards/DEV-1', () => {
        if (deleted) {
          fetchedAfterDelete++
          return HttpResponse.json({ message: 'Не найдено.' }, { status: 404 })
        }
        return HttpResponse.json({
          data: makeCardDetail({
            permissions: { edit: true, comment: true, restricted: false, delete: true },
          }),
        })
      }),
      http.delete('*/api/v1/cards/DEV-1', () => {
        deleted++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('button', { name: 'Удалить…' }))
    const confirm = await screen.findByRole('dialog', { name: 'Удалить DEV-1?' })
    expect(confirm).toHaveTextContent('попадёт в корзину')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Отмена' }))
    expect(deleted).toBe(0)

    await userEvent.click(within(panel).getByRole('button', { name: 'Удалить…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Удалить DEV-1?' })).getByRole('button', {
        name: 'Удалить',
      }),
    )

    expect(await screen.findByText('Карточка удалена в корзину')).toBeInTheDocument()
    expect(deleted).toBe(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
    // Удалённую карточку не перезапрашиваем — «Карточка не найдена» не мелькает
    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    expect(screen.queryByText('Карточка не найдена')).not.toBeInTheDocument()
    expect(fetchedAfterDelete).toBe(0)
  })

  it('без права удаления кнопки «Удалить…» нет', async () => {
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByRole('button', { name: 'Архивировать' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Удалить…' })).not.toBeInTheDocument()
  })

  it('закрытие панели возвращает на адрес доски, клавиша Enter открывает карточку', async () => {
    server.use(
      http.get('*/api/v1/cards/DEV-2', () =>
        HttpResponse.json({ data: makeCardDetail({ id: 'c2', key: 'DEV-2', title: 'Вторая' }) }),
      ),
      http.get('*/api/v1/cards/DEV-2/history', () => HttpResponse.json(makeCardHistory())),
    )
    const { router } = renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    await userEvent.click(within(panel).getByRole('button', { name: 'Закрыть' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
    // Дождаться, пока панель закроется целиком: при закрытии Radix возвращает фокус и мог бы
    // перехватить его у карточки
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const tile = screen.getByRole('button', { name: 'Открыть DEV-2: Вторая' })
    tile.focus()
    expect(tile).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/cards/DEV-2'))
  })
})
