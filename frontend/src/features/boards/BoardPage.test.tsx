import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { BoardDetail } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

function serveBoard(board: BoardDetail = makeBoardDetail()) {
  server.use(http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })))
}

describe('Доска', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))

  it('показывает колонки с подколонками, счётчики и карточки с меткой типа', async () => {
    serveBoard()
    renderApp('/boards/board-1')

    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    for (const name of ['To Do', 'In Progress', 'Dev', 'QA', 'Done']) {
      expect(
        screen.getByRole('button', { name: `Действия с колонкой «${name}»` }),
      ).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Открыть DEV-2: Вторая' })).toHaveTextContent('Баг')
    // Одна дорожка — заголовок дорожки не показывается
    expect(screen.queryByRole('button', { name: /Действия с дорожкой/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/нет колонки типа «Готово»/)).not.toBeInTheDocument()
  })

  it('описание доски — за значком ⓘ в шапке, во всплывающем окне с переносами строк', async () => {
    serveBoard(makeBoardDetail({ description: 'Как завести баг:\nГде — экран и путь к нему.' }))
    renderApp('/boards/board-1')

    await screen.findByRole('heading', { name: 'Продукт' })
    expect(screen.queryByText(/Как завести баг:/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Описание доски «/ }))
    const description = await screen.findByText(/Как завести баг:/)
    expect(description).toHaveTextContent('Где — экран и путь к нему.')
    expect(description).toHaveClass('whitespace-pre-line')
  })

  it.each([
    ['без описания', null],
    ['пустое описание', ''],
    ['описание из одних пробелов', '  \n  '],
  ])('%s — значка ⓘ нет (LATER-64)', async (_, description) => {
    serveBoard(makeBoardDetail({ description }))
    renderApp('/boards/board-1')

    await screen.findByRole('heading', { name: 'Продукт' })
    expect(screen.queryByRole('button', { name: /^Описание доски «/ })).not.toBeInTheDocument()
  })

  it('с несколькими дорожками показывает их заголовки; без «Готово» — предупреждение', async () => {
    const board = makeBoardDetail({
      has_done_column: false,
      lanes: [
        { id: 'main', name: 'Основная', position: 'a0' },
        { id: 'urgent', name: 'Срочные', position: 'a1' },
      ],
    })
    serveBoard(board)
    renderApp('/boards/board-1')

    expect(
      await screen.findByRole('button', { name: 'Действия с дорожкой «Срочные»' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/нет колонки типа «Готово»/)).toBeInTheDocument()
  })

  it('создаёт карточку прямо в ячейке', async () => {
    let body: unknown
    serveBoard()
    server.use(
      http.post('*/api/v1/boards/board-1/cards', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeCardDetail() }, { status: 201 })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить карточку в To Do' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Добавить карточку в To Do' }),
      'Новая{Enter}',
    )

    await vi.waitFor(() =>
      expect(body).toEqual({ title: 'Новая', column_id: 'todo', lane_id: 'main', after_id: 'c1' }),
    )
  })

  it('форма новой карточки: кнопка «Создать» создаёт и оставляет форму для следующей (LATER-42)', async () => {
    let body: unknown
    serveBoard()
    server.use(
      http.post('*/api/v1/boards/board-1/cards', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeCardDetail() }, { status: 201 })
      }),
    )
    renderApp('/boards/board-1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Добавить карточку в To Do' }))
    const create = screen.getByRole('button', { name: 'Создать карточку в To Do' })
    expect(create).toBeDisabled()

    const field = screen.getByRole('textbox', { name: 'Добавить карточку в To Do' })
    await user.type(field, 'Новая')
    await user.click(create)

    await vi.waitFor(() =>
      expect(body).toEqual({ title: 'Новая', column_id: 'todo', lane_id: 'main', after_id: 'c1' }),
    )
    // Как после Enter: поле очищено, в фокусе — можно сразу вводить следующую карточку
    await vi.waitFor(() => expect(field).toHaveValue(''))
    expect(field).toHaveFocus()
  })

  it('форма новой карточки: «Отмена» закрывает форму без запроса, даже с введённым названием (LATER-42)', async () => {
    let requests = 0
    serveBoard()
    server.use(
      http.post('*/api/v1/boards/board-1/cards', () => {
        requests++
        return HttpResponse.json({ data: makeCardDetail() }, { status: 201 })
      }),
    )
    renderApp('/boards/board-1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Добавить карточку в To Do' }))
    await user.type(screen.getByRole('textbox', { name: 'Добавить карточку в To Do' }), 'Черновик')
    await user.click(screen.getByRole('button', { name: 'Отмена создания карточки в To Do' }))

    expect(
      screen.queryByRole('textbox', { name: 'Добавить карточку в To Do' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить карточку в To Do' })).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it('при доступе «только свои» через группу перетаскиваются только свои карточки', async () => {
    const board = makeBoardDetail()
    board.cards = board.cards.map((card, index) => ({ ...card, can_edit: index === 0 }))
    serveBoard(board)
    renderApp('/boards/board-1')

    const [own, foreign] = board.cards
    const ownTile = await screen.findByRole('button', { name: `Открыть ${own.key}: ${own.title}` })
    expect(ownTile).toHaveAttribute('aria-roledescription')
    expect(ownTile).toHaveAccessibleDescription(/пробел/)
    // Чужую карточку перенести нельзя, но открыть можно: для диктора — обычная кнопка, без «недоступно» и без
    // инструкции переноса (LATER-76)
    const foreignTile = screen.getByRole('button', {
      name: `Открыть ${foreign.key}: ${foreign.title}`,
    })
    expect(foreignTile).not.toHaveAttribute('aria-disabled')
    expect(foreignTile).not.toHaveAttribute('aria-roledescription')
    expect(foreignTile).not.toHaveAccessibleDescription()
    expect(foreignTile).toHaveAttribute('tabindex', '0')
  })

  it('комментатор только смотрит: нет добавления карточек и меню структуры', async () => {
    serveBoard(
      makeBoardDetail({ permissions: { manage: false, edit_cards: false, delete_cards: false } }),
    )
    renderApp('/boards/board-1')

    const tile = await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })
    // Переносить нельзя — карточка не «недоступна» для диктора, она открывается (LATER-76)
    expect(tile).not.toHaveAttribute('aria-disabled')
    expect(tile).not.toHaveAccessibleDescription()
    expect(screen.queryByRole('button', { name: /Добавить карточку/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Действия с колонкой/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Действия с доской «/ })).not.toBeInTheDocument()
  })

  it('смена типа колонки предупреждает, сколько карточек затронет', async () => {
    let body: unknown
    serveBoard()
    server.use(
      http.put('*/api/v1/columns/progress/category', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { cards_affected: 1 } })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Действия с колонкой «In Progress»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Сменить тип' }))
    // Окно из «⋯» открывается после того, как меню вернуло фокус на «⋯» (кадром позже)
    await userEvent.selectOptions(await screen.findByLabelText('Тип'), 'done')

    expect(screen.getByText(/Сменится статус 1 карточки/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Тип изменён')).toBeInTheDocument()
    expect(body).toEqual({ category: 'done' })
  })

  it('добавляет подколонку и колонку', async () => {
    const requests: unknown[] = []
    serveBoard()
    server.use(
      http.post('*/api/v1/boards/board-1/columns', async ({ request }) => {
        requests.push(await request.json())
        return HttpResponse.json({ data: {} }, { status: 201 })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Действия с колонкой «To Do»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Добавить подколонку' }))
    await userEvent.type(await screen.findByLabelText('Название'), 'Анализ')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить подколонку' }))
    await screen.findByText('Сохранено')

    await userEvent.click(screen.getByRole('button', { name: /^Действия с доской «/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Добавить колонку' }))
    // Окно из «⋯» доски открывается после того, как меню вернуло фокус на «⋯»
    await userEvent.type(await screen.findByLabelText('Название'), 'Релиз')
    await userEvent.selectOptions(screen.getByLabelText('Тип'), 'done')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }))

    await vi.waitFor(() =>
      expect(requests).toEqual([
        { name: 'Анализ', parent_id: 'todo' },
        { name: 'Релиз', category: 'done' },
      ]),
    )
  })

  it('ошибку сервера при архивации колонки показывает понятным текстом', async () => {
    serveBoard()
    server.use(
      http.post('*/api/v1/columns/todo/archive', () =>
        HttpResponse.json(
          { message: 'В колонке есть карточки — сначала перенесите их.', errors: {} },
          { status: 422 },
        ),
      ),
    )
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Действия с колонкой «To Do»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Архивировать' }),
    )

    expect(
      await screen.findByText('В колонке есть карточки — сначала перенесите их.'),
    ).toBeInTheDocument()
  })

  it('чужая или несуществующая доска — «не найдено»', async () => {
    server.use(
      http.get('*/api/v1/boards/nope', () =>
        HttpResponse.json({ message: 'Не найдено.' }, { status: 404 }),
      ),
    )
    renderApp('/boards/nope')

    expect(await screen.findByText('Доска не найдена')).toBeInTheDocument()
  })
})

describe('Карточка по ссылке', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))

  it('открывается в панели поверх своей доски; правка названия сохраняется', async () => {
    let body: unknown
    serveBoard()
    server.use(
      http.get('*/api/v1/cards/DEV-1', () =>
        HttpResponse.json({
          data: makeCardDetail({
            completed_at: '2026-10-02T12:00:00.000000Z',
            metrics: { lead_time_seconds: 27 * 3600, cycle_time_seconds: 3 * 3600 + 600 },
          }),
        }),
      ),
      http.get('*/api/v1/cards/DEV-1/history', () =>
        HttpResponse.json(
          makeCardHistory({
            data: [
              {
                id: 't1',
                kind: 'transition',
                at: '2026-10-01T09:00:00.000000Z',
                transition: {
                  id: 1,
                  moved_at: '2026-10-01T09:00:00.000000Z',
                  reason: 'created',
                  actor: { id: 'u1', name: 'Борис' },
                  from_board: null,
                  to_board: { id: 'board-1', name: 'Продукт' },
                  from_column: null,
                  to_column: { id: 'todo', name: 'To Do' },
                  from_lane: null,
                  to_lane: { id: 'main', name: 'Основная' },
                  from_category: null,
                  to_category: 'queue',
                },
              },
            ],
          }),
        ),
      ),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
      http.patch('*/api/v1/cards/DEV-1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeCardDetail({ title: 'Переименована' }) })
      }),
    )
    renderApp('/cards/DEV-1')

    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByText('Создана в «To Do»')).toBeInTheDocument()
    expect(within(panel).getByText(/lead time\): 1 д 3 ч/)).toBeInTheDocument()
    expect(within(panel).getByText(/cycle time\): 3 ч 10 мин/)).toBeInTheDocument()
    // Доска под панелью тоже на месте
    expect(screen.getByRole('heading', { name: 'Продукт', hidden: true })).toBeInTheDocument()

    const title = within(panel).getByLabelText('Название')
    await userEvent.clear(title)
    await userEvent.type(title, 'Переименована{Enter}')
    await vi.waitFor(() => expect(body).toEqual({ title: 'Переименована' }))
  })

  it('без доступа по прямой ссылке — «Карточка не найдена»', async () => {
    server.use(
      http.get('*/api/v1/cards/DEV-1', () =>
        HttpResponse.json({ message: 'Не найдено.' }, { status: 404 }),
      ),
    )
    renderApp('/cards/DEV-1')

    expect(await screen.findByText('Карточка не найдена')).toBeInTheDocument()
  })
})
