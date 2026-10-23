import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { BoardDetail } from '@/shared/types/api'
import { makeBoardCard, makeBoardDetail, makeCardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

/*
| «+ Карточка» на доске (LATER-44): в ячейке с карточками — по наведению на зону под последней карточкой и по
| фокусу (сам показ — CSS, его проверяет E2E), в пустой ячейке — всегда; «+» в заголовке листовой колонки —
| карточка в начало; только с правом создавать карточки; во время перетаскивания кнопок нет.
*/

function serveBoard(board: BoardDetail = makeBoardDetail()) {
  const bodies: unknown[] = []
  server.use(
    http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })),
    http.post('*/api/v1/boards/board-1/cards', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ data: makeCardDetail() }, { status: 201 })
    }),
  )
  return bodies
}

describe('Доска: добавление карточек', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))

  it('в ячейке с карточками кнопка появляется по наведению, в пустой — видна всегда', async () => {
    serveBoard()
    renderApp('/boards/board-1')

    const button = async (column: string) =>
      screen.findByRole('button', { name: `Добавить карточку в ${column}` })
    // To Do и Dev — с карточками, QA и Done — пустые
    expect(await button('To Do')).toHaveAttribute('data-reveal', 'hover')
    expect(await button('Dev')).toHaveAttribute('data-reveal', 'hover')
    expect(await button('QA')).not.toHaveAttribute('data-reveal')
    expect(await button('Done')).not.toHaveAttribute('data-reveal')
  })

  it('«+» — в заголовке каждой листовой колонки; у колонки с подколонками — в заголовках подколонок', async () => {
    serveBoard()
    renderApp('/boards/board-1')

    for (const column of ['To Do', 'Dev', 'QA', 'Done']) {
      expect(
        await screen.findByRole('button', { name: `Добавить карточку в начало ${column}` }),
      ).toBeInTheDocument()
    }
    expect(
      screen.queryByRole('button', { name: 'Добавить карточку в начало In Progress' }),
    ).not.toBeInTheDocument()
  })

  it('«+» в заголовке добавляет карточку в начало колонки', async () => {
    const bodies = serveBoard()
    const user = userEvent.setup()
    renderApp('/boards/board-1')

    await user.click(
      await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' }),
    )
    // Одна дорожка — выбора дорожки нет
    expect(screen.queryByRole('combobox', { name: 'Дорожка' })).not.toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'Добавить карточку в начало To Do' }),
      'Сверху{Enter}',
    )

    await vi.waitFor(() =>
      expect(bodies).toEqual([
        { title: 'Сверху', column_id: 'todo', lane_id: 'main', before_id: 'c1' },
      ]),
    )
  })

  it('после Esc или «Отмена» фокус — на кнопке, которая открыла форму (LATER-107)', async () => {
    serveBoard()
    const user = userEvent.setup()
    renderApp('/boards/board-1')

    // «+» заголовка колонки — с клавиатуры, Esc
    const top = await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' })
    top.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('textbox', { name: 'Добавить карточку в начало To Do' }),
    ).not.toBeInTheDocument()
    await vi.waitFor(() => expect(top).toHaveFocus())

    // «+ Карточка» ячейки — мышью, «Отмена»
    await user.click(screen.getByRole('button', { name: 'Добавить карточку в QA' }))
    await user.click(screen.getByRole('button', { name: 'Отмена создания карточки в QA' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Добавить карточку в QA' })).toHaveFocus(),
    )
  })

  it('кнопка под последней карточкой добавляет в конец ячейки', async () => {
    const bodies = serveBoard()
    const user = userEvent.setup()
    renderApp('/boards/board-1')

    await user.click(await screen.findByRole('button', { name: 'Добавить карточку в To Do' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Добавить карточку в To Do' }),
      'Снизу{Enter}',
    )

    await vi.waitFor(() =>
      expect(bodies).toEqual([
        { title: 'Снизу', column_id: 'todo', lane_id: 'main', after_id: 'c1' },
      ]),
    )
  })

  it('несколько дорожек: в форме «+» из заголовка — выбор дорожки', async () => {
    const board = makeBoardDetail({
      lanes: [
        { id: 'main', name: 'Основная', position: 'a0' },
        { id: 'urgent', name: 'Срочные', position: 'a1' },
      ],
    })
    board.cards = [
      ...board.cards,
      makeBoardCard({
        id: 'c3',
        key: 'DEV-3',
        title: 'Срочная',
        column_id: 'todo',
        lane_id: 'urgent',
      }),
    ]
    const bodies = serveBoard(board)
    const user = userEvent.setup()
    renderApp('/boards/board-1')

    await user.click(
      await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' }),
    )
    const lane = screen.getByRole('combobox', { name: 'Дорожка' })
    expect(lane).toHaveValue('main')
    await user.selectOptions(lane, 'urgent')
    await user.type(
      screen.getByRole('textbox', { name: 'Добавить карточку в начало To Do' }),
      'Срочно сверху{Enter}',
    )

    await vi.waitFor(() =>
      expect(bodies).toEqual([
        { title: 'Срочно сверху', column_id: 'todo', lane_id: 'urgent', before_id: 'c3' },
      ]),
    )
  })

  it('без права создавать карточки — ни «+» в заголовках, ни кнопок в ячейках', async () => {
    serveBoard(
      makeBoardDetail({ permissions: { manage: false, edit_cards: false, delete_cards: false } }),
    )
    renderApp('/boards/board-1')

    expect(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /Добавить карточку/ })).toHaveLength(0)
  })

  it('во время перетаскивания кнопок «+ Карточка» в ячейках нет', async () => {
    serveBoard()
    const user = userEvent.setup()
    renderApp('/boards/board-1')

    const tile = await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })
    const qa = screen.getByRole('group', { name: 'QA' })
    expect(within(qa).getByRole('button', { name: 'Добавить карточку в QA' })).toBeInTheDocument()

    tile.focus()
    await user.keyboard(' ') // пробел — взять карточку
    await vi.waitFor(() =>
      expect(
        within(qa).queryByRole('button', { name: 'Добавить карточку в QA' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.queryAllByRole('button', { name: /^Добавить карточку в (To Do|Dev|Done)$/ }),
    ).toHaveLength(0)

    await user.keyboard('{Escape}') // отменить перетаскивание
    expect(
      await within(qa).findByRole('button', { name: 'Добавить карточку в QA' }),
    ).toBeInTheDocument()
  })
})
