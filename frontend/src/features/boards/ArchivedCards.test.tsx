import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CardSummary } from '@/shared/types/api'
import { makeBoardCard, makeBoardDetail, makeCardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const archived = (key: string, title: string): CardSummary => ({
  id: key,
  key,
  title,
  board: { id: 'board-1', name: 'Продукт' },
  column: { name: 'Done', category: 'done' },
  archived_at: '2026-10-02T09:00:00Z',
})

describe('Доска: архив карточек и блокировка на фасаде', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member', timezone: 'Europe/Moscow' })))

  it('заблокированная карточка выделена на фасаде', async () => {
    const board = makeBoardDetail()
    board.cards = [
      makeBoardCard({
        id: 'c1',
        key: 'DEV-1',
        title: 'Первая',
        column_id: 'todo',
        is_blocked: true,
      }),
      makeBoardCard({ id: 'c2', key: 'DEV-2', title: 'Вторая', column_id: 'todo' }),
    ]
    server.use(http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })))
    renderApp('/boards/board-1')

    expect(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })).toHaveTextContent(
      'Заблокирована',
    )
    expect(screen.getByRole('button', { name: 'Открыть DEV-2: Вторая' })).not.toHaveTextContent(
      'Заблокирована',
    )
  })

  it('ищет в архиве по номеру или названию и восстанавливает карточку', async () => {
    const searches: string[] = []
    let restored = ''
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/boards/board-1/archived-cards', ({ request }) => {
        const search = new URL(request.url).searchParams.get('search') ?? ''
        searches.push(search)
        const all = [archived('DEV-7', 'Старый отчёт'), archived('DEV-3', 'Логин')]
        const data = all.filter((c) => !search || c.title.toLowerCase().includes(search))
        return HttpResponse.json({
          data,
          meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
        })
      }),
      http.post('*/api/v1/cards/:key/restore', ({ params }) => {
        restored = String(params.key)
        return HttpResponse.json({ data: makeCardDetail({ key: restored }) })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Архив карточек' }))
    const dialog = await screen.findByRole('dialog', { name: 'Архив карточек' })
    expect(await within(dialog).findByText('Старый отчёт')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'DEV-3' })).toHaveAttribute(
      'href',
      '/cards/DEV-3',
    )
    expect(within(dialog).getAllByText(/^Done · в архиве с /)).toHaveLength(2)

    await userEvent.type(within(dialog).getByLabelText('Поиск по номеру или названию'), 'логин')
    await vi.waitFor(() => expect(searches.at(-1)).toBe('логин'))
    await vi.waitFor(() =>
      expect(within(dialog).queryByText('Старый отчёт')).not.toBeInTheDocument(),
    )

    // Удалить в корзину может только системный администратор
    expect(within(dialog).queryByRole('button', { name: /в корзину/ })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Карточка восстановлена')).toBeInTheDocument()
    expect(restored).toBe('DEV-3')

    await userEvent.clear(within(dialog).getByLabelText('Поиск по номеру или названию'))
    await userEvent.type(
      within(dialog).getByLabelText('Поиск по номеру или названию'),
      'нет такого',
    )
    expect(await within(dialog).findByText('Ничего не найдено')).toBeInTheDocument()
  })

  it('без права правки карточек кнопки архива нет', async () => {
    server.use(
      http.get('*/api/v1/boards/board-1', () =>
        HttpResponse.json({
          data: makeBoardDetail({
            permissions: { manage: false, edit_cards: false, delete_cards: false },
          }),
        }),
      ),
    )
    renderApp('/boards/board-1')

    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Архив карточек' })).not.toBeInTheDocument()
  })

  it('системный администратор удаляет архивную карточку в корзину после подтверждения', async () => {
    signedInAs(makeUser({ role: 'admin', timezone: 'Europe/Moscow' }))
    const deleted: string[] = []
    const board = makeBoardDetail({
      permissions: { manage: true, edit_cards: true, delete_cards: true },
    })
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })),
      http.get('*/api/v1/boards/board-1/archived-cards', () =>
        HttpResponse.json({
          data: [archived('DEV-7', 'Старый отчёт')].filter((c) => !deleted.includes(c.key)),
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 - deleted.length },
        }),
      ),
      http.delete('*/api/v1/cards/:key', ({ params }) => {
        deleted.push(String(params.key))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Архив карточек' }))
    const dialog = await screen.findByRole('dialog', { name: 'Архив карточек' })
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Удалить DEV-7 в корзину' }),
    )
    const confirm = await screen.findByRole('dialog', { name: 'Удалить DEV-7?' })
    expect(confirm).toHaveTextContent('«Старый отчёт»')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByText('Карточка удалена в корзину')).toBeInTheDocument()
    expect(deleted).toEqual(['DEV-7'])
    expect(await within(dialog).findByText('В архиве пусто')).toBeInTheDocument()
  })

  it('корзина в архиве — только по праву доски delete_cards, а не по системной роли', async () => {
    signedInAs(makeUser({ role: 'admin' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () =>
        HttpResponse.json({
          data: makeBoardDetail({
            permissions: { manage: false, edit_cards: true, delete_cards: false },
          }),
        }),
      ),
      http.get('*/api/v1/boards/board-1/archived-cards', () =>
        HttpResponse.json({
          data: [archived('DEV-7', 'Старый отчёт')],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
        }),
      ),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Архив карточек' }))
    const dialog = await screen.findByRole('dialog', { name: 'Архив карточек' })
    expect(await within(dialog).findByText('Старый отчёт')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /в корзину/ })).not.toBeInTheDocument()
  })
})
