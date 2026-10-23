import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { SpaceBoard } from '@/shared/types/api'
import { makeBoardCard, makeBoardDetail } from '@/test/boards'
import { makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

function board(id: string, name: string, row: string, overrides: Partial<SpaceBoard> = {}) {
  return {
    id,
    space_id: 'space-1',
    row_id: row,
    name,
    description: null,
    position: 'a0',
    archived_at: null,
    leaf_columns_count: 4,
    cards_count: 0,
    collapsed: false,
    ...overrides,
  } satisfies SpaceBoard
}

// Ряды: [Продукт, Узкая], [Инфраструктура (свёрнута, 7 карточек)]; «Старая» — в архиве
const boards: SpaceBoard[] = [
  board('b-product', 'Продукт', 'r1'),
  board('b-narrow', 'Узкая', 'r1', { leaf_columns_count: 1 }),
  board('b-infra', 'Инфраструктура', 'r2', { collapsed: true, cards_count: 7 }),
  board('b-old', 'Старая', 'r3', { archived_at: '2026-10-01T00:00:00Z' }),
]

/** Запросы досок по id: свёрнутая доска не должна загружаться. */
let fetched: string[]

function serve(list: SpaceBoard[] = boards, space = makeSpace()) {
  fetched = []
  server.use(
    http.get('*/api/v1/spaces/DEV', () => HttpResponse.json({ data: space })),
    http.get('*/api/v1/spaces/DEV/boards', () => HttpResponse.json({ data: list })),
    http.get('*/api/v1/boards/:id', ({ params }) => {
      const summary = list.find((b) => b.id === params.id)!
      fetched.push(summary.id)
      return HttpResponse.json({
        data: makeBoardDetail({
          id: summary.id,
          name: summary.name,
          permissions: {
            manage: space.permissions.manage,
            edit_cards: space.permissions.edit_cards,
            delete_cards: false,
          },
          cards: summary.id === 'b-product' ? [makeBoardCard({ id: '12', column_id: 'todo' })] : [],
        }),
      })
    }),
  )
}

/**
 * Блок доски по названию. Заглушка загружающейся доски и свёрнутая доска сменяются настоящим блоком — другим элементом,
 * поэтому блок ищется заново каждый раз, а загруженная доска ждётся по её карточке или телу.
 */
const region = (name: string) => screen.findByRole('region', { name })
const loaded = async (name: string) => {
  await waitFor(() =>
    expect(screen.getByRole('region', { name }).querySelector('[data-board-body]')).not.toBeNull(),
  )
  return screen.getByRole('region', { name })
}

describe('Страница пространства: доски рядами', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))

  it('показывает активные доски по рядам; свёрнутая — «Название · N карточек» и не загружается', async () => {
    serve()
    renderApp('/spaces/DEV')

    const product = await loaded('Продукт')
    expect(within(product).getByRole('button', { name: /^Открыть DEV-12/ })).toBeVisible()
    expect(await loaded('Узкая')).toBeInTheDocument()
    const infra = await region('Инфраструктура')
    expect(infra).toHaveTextContent('Инфраструктура· 7 карточек')
    expect(screen.queryByRole('region', { name: 'Старая' })).not.toBeInTheDocument()

    const rows = document.querySelectorAll('[data-board-row]')
    expect(rows).toHaveLength(2)
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Продукт', 'Узкая'])
    // Доски не сжимаются: место — ширина по колонкам (4 колонки — 1138 px, одна — 20rem), не шире холста (CSS);
    // свёрнутая — по своей шапке
    const width = (name: string) =>
      document
        .querySelector<HTMLElement>(`[data-board-slot] section[aria-label="${name}"]`)!
        .closest<HTMLElement>('[data-board-slot]')!
        .style.getPropertyValue('--slot-w')
    expect(width('Продукт')).toBe('1138px')
    expect(width('Узкая')).toBe('320px')
    expect(width('Инфраструктура')).toBe('')
    expect(within(rows[1] as HTMLElement).getByRole('region')).toBe(infra)
    await waitFor(() => expect(fetched.sort()).toEqual(['b-narrow', 'b-product']))
  })

  it('сворачивает и разворачивает доску у себя', async () => {
    const requests: string[] = []
    serve()
    server.use(
      http.put('*/api/v1/boards/:id/collapsed', ({ params }) => {
        requests.push(`PUT ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/api/v1/boards/:id/collapsed', ({ params }) => {
        requests.push(`DELETE ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/spaces/DEV')

    const product = await loaded('Продукт')
    const collapse = within(product).getByRole('button', { name: 'Свернуть доску «Продукт»' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(collapse)

    // Счётчик свёрнутой — по загруженной доске (1 карточка), а не по списку
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Продукт' })).toHaveTextContent(
        'Продукт· 1 карточка',
      ),
    )
    expect(screen.queryByRole('button', { name: /^Открыть DEV-12/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Развернуть доску «Продукт»' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    // Щелчок по шапке свёрнутой доски разворачивает её
    await userEvent.click(within(await region('Инфраструктура')).getByText('Инфраструктура'))
    await waitFor(() => expect(fetched).toContain('b-infra'))
    expect(requests).toEqual(['PUT b-product', 'DELETE b-infra'])
  })

  it('администратор переставляет доску пунктами меню «Переставить»', async () => {
    let body: unknown
    const list = [...boards]
    serve(list)
    server.use(
      http.post('*/api/v1/boards/:id/move', async ({ request, params }) => {
        body = { id: params.id, ...((await request.json()) as object) }
        // Сервер переставил: следующее чтение списка — уже в новом порядке
        list.splice(0, 2, boards[1], boards[0])
        return HttpResponse.json({ data: boards[0] })
      }),
    )
    renderApp('/spaces/DEV')

    // Меню загруженной доски (у заглушки — своё, короткое)
    const product = await loaded('Продукт')
    await userEvent.click(
      within(product).getByRole('button', { name: 'Действия с доской «Продукт»' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Переставить' }))
    expect(await screen.findByRole('menuitem', { name: 'Левее' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'В ряд выше' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Правее' }))

    await waitFor(() =>
      expect(body).toEqual({ id: 'b-product', row_id: 'r1', after_id: 'b-narrow' }),
    )
    // Раскладка в кеше — сразу
    const firstRow = document.querySelector('[data-board-row]') as HTMLElement
    expect(
      within(firstRow)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Узкая', 'Продукт'])
  })

  it('«Отдельным рядом» — новый ряд сразу под своим', async () => {
    const bodies: unknown[] = []
    const list = [...boards]
    serve(list)
    server.use(
      http.post('*/api/v1/boards/:id/move', async ({ request }) => {
        bodies.push(await request.json())
        list[1] = { ...boards[1], row_id: 'r-new' }
        return HttpResponse.json({ data: list[1] })
      }),
    )
    renderApp('/spaces/DEV')

    const narrow = await loaded('Узкая')
    const arrange = async (item: string) => {
      await userEvent.click(
        await within(narrow).findByRole('button', { name: 'Действия с доской «Узкая»' }),
      )
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Переставить' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: item }))
    }
    await arrange('Отдельным рядом')
    await waitFor(() =>
      expect(bodies).toEqual([{ new_row_after_id: 'r1', new_row_before_id: 'r2' }]),
    )
    await waitFor(() => expect(document.querySelectorAll('[data-board-row]')).toHaveLength(3))
  })

  it('участник без прав администратора: ни ручки ⠿, ни пунктов перестановки, ни «Создать доску»', async () => {
    serve(
      boards,
      makeSpace({
        my_role: 'editor',
        permissions: { manage: false, edit_cards: true, view_access_sources: true },
      }),
    )
    renderApp('/spaces/DEV')

    const product = await loaded('Продукт')
    expect(product.querySelector('[data-board-handle]')).toBeNull()
    await userEvent.click(
      within(product).getByRole('button', { name: 'Действия с доской «Продукт»' }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Архив карточек' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Переставить' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Создать доску' })).not.toBeInTheDocument()
    // У свёрнутой доски меню нет — в нём только перестановка и архив
    expect(
      within(await region('Инфраструктура')).queryByRole('button', { name: /Действия с доской/ }),
    ).not.toBeInTheDocument()
  })

  it('без прав на правку и структуру у доски нет «⋯» (пустого меню)', async () => {
    serve(
      boards,
      makeSpace({
        my_role: 'commenter',
        permissions: { manage: false, edit_cards: false, view_access_sources: true },
      }),
    )
    renderApp('/spaces/DEV')

    const product = await loaded('Продукт')
    expect(
      within(product).queryByRole('button', { name: /Действия с доской/ }),
    ).not.toBeInTheDocument()
    expect(within(product).getByRole('button', { name: 'Свернуть доску «Продукт»' })).toBeVisible()
  })

  it('переход к доске (?board=ID) с вкладки «Участники» открывает «Доски»', async () => {
    serve()
    const { router } = renderApp('/spaces/DEV')
    await loaded('Продукт')
    await userEvent.click(screen.getByRole('tab', { name: 'Участники' }))
    expect(screen.getByRole('tab', { name: 'Участники' })).toHaveAttribute('aria-selected', 'true')

    await act(() => router.navigate('/spaces/DEV?board=b-narrow'))
    expect(screen.getByRole('tab', { name: 'Доски' })).toHaveAttribute('aria-selected', 'true')
    // Холст не размонтировался: загруженная доска на месте сразу
    expect(
      screen.getByRole('region', { name: 'Продукт' }).querySelector('[data-board-body]'),
    ).not.toBeNull()
  })

  it('?board=ID из дерева разворачивает свёрнутую доску насовсем', async () => {
    let expanded = ''
    serve()
    server.use(
      http.delete('*/api/v1/boards/:id/collapsed', ({ params }) => {
        expanded = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/spaces/DEV?board=b-infra')

    await waitFor(() => expect(expanded).toBe('b-infra'))
    expect(
      within(await loaded('Инфраструктура')).getByRole('button', {
        name: 'Свернуть доску «Инфраструктура»',
      }),
    ).toBeInTheDocument()
  })

  it('«Архив досок»: архивные доски и восстановление', async () => {
    let restored = ''
    serve()
    server.use(
      http.post('*/api/v1/boards/:id/restore', ({ params }) => {
        restored = String(params.id)
        return HttpResponse.json({ data: boards[3] })
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('button', { name: 'Архив досок' }))
    const dialog = await screen.findByRole('dialog', { name: 'Архив досок' })
    expect(within(dialog).getByRole('link', { name: 'Старая' })).toHaveAttribute(
      'href',
      '/boards/b-old',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Доска восстановлена')).toBeInTheDocument()
    expect(restored).toBe('b-old')
  })

  describe('доска загрузилась, пока открыты её «⋯» или ⓘ (LATER-99)', () => {
    /** Ответ доски «Продукт» придержан до release(): пока его нет, у доски шапка-заглушка. */
    function holdBoard() {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      serve([board('b-product', 'Продукт', 'r1', { description: 'Шаблон задачи' })])
      server.use(
        http.get('*/api/v1/boards/b-product', async () => {
          await held
          return HttpResponse.json({
            data: makeBoardDetail({
              id: 'b-product',
              name: 'Продукт',
              description: 'Шаблон задачи',
            }),
          })
        }),
      )
      return () => act(release)
    }

    it('меню «⋯» остаётся открытым — уже с пунктами загруженной доски', async () => {
      const release = holdBoard()
      const user = userEvent.setup()
      renderApp('/spaces/DEV')

      const placeholder = await region('Продукт')
      expect(placeholder).toHaveAttribute('aria-busy', 'true')
      await user.click(
        within(placeholder).getByRole('button', { name: 'Действия с доской «Продукт»' }),
      )
      expect(await screen.findByRole('menuitem', { name: 'Переставить' })).toBeInTheDocument()

      await release()
      await loaded('Продукт')
      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(await screen.findByRole('menuitem', { name: 'Добавить колонку' })).toBeInTheDocument()

      // Закрытое меню возвращает фокус на «⋯» загруженной доски
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
      expect(
        within(screen.getByRole('region', { name: 'Продукт' })).getByRole('button', {
          name: 'Действия с доской «Продукт»',
        }),
      ).toHaveFocus()
    })

    it('окно описания ⓘ остаётся открытым', async () => {
      const release = holdBoard()
      const user = userEvent.setup()
      renderApp('/spaces/DEV')

      const placeholder = await region('Продукт')
      await user.click(
        within(placeholder).getByRole('button', { name: 'Описание доски «Продукт»' }),
      )
      expect(await screen.findByText('Шаблон задачи', { selector: 'p' })).toBeInTheDocument()

      await release()
      await loaded('Продукт')
      expect(screen.getByText('Шаблон задачи', { selector: 'p' })).toBeInTheDocument()
    })
  })

  it('архивирует доску из её меню после подтверждения', async () => {
    let archived = ''
    serve()
    server.use(
      http.post('*/api/v1/boards/:id/archive', ({ params }) => {
        archived = String(params.id)
        return HttpResponse.json({ data: boards[1] })
      }),
    )
    renderApp('/spaces/DEV')

    const narrow = await loaded('Узкая')
    await userEvent.click(within(narrow).getByRole('button', { name: 'Действия с доской «Узкая»' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Архивировать доску…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Архивировать доску?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Архивировать' }))

    expect(await screen.findByText('Доска архивирована')).toBeInTheDocument()
    expect(archived).toBe('b-narrow')
  })

  it('карточка открывается поверх пространства и закрывается обратно', async () => {
    serve()
    // Ответ на запрос карточки тест отдаёт сам — после того как окно открылось. Иначе одно ожидание (3 с) покрывало
    // всю цепочку «адрес → окно → запрос → 404 → окно закрыто → уведомление», и на загруженном CI её не хватало
    let respond!: () => void
    const responded = new Promise<void>((resolve) => (respond = resolve))
    server.use(
      http.get('*/api/v1/cards/DEV-12', async () => {
        await responded
        return HttpResponse.json({ message: '' }, { status: 404 })
      }),
    )
    const { router } = renderApp('/spaces/DEV')

    await userEvent.click(
      within(await loaded('Продукт')).getByRole('button', { name: /^Открыть DEV-12/ }),
    )
    expect(router.state.location.pathname).toBe('/spaces/DEV/cards/DEV-12')
    // Окно открылось поверх пространства и ждёт карточку
    expect(await screen.findByRole('dialog', { name: 'DEV-12' })).toHaveTextContent('Загрузка…')

    // Карточки нет — окна нет: сообщение и обратно на пространство, доски на месте
    respond()
    expect(await screen.findByText('Карточка не найдена')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces/DEV'))
    expect(await region('Продукт')).toBeInTheDocument()
  })

  it('пустое пространство — подсказка, у администратора — как создать доску', async () => {
    serve([])
    renderApp('/spaces/DEV')

    expect(await screen.findByText('Досок пока нет')).toBeInTheDocument()
    expect(screen.getByText('Создайте первую доску — по шаблону или пустую.')).toBeInTheDocument()
    // Кнопка — и на панели, и в пустом состоянии
    expect(screen.getAllByRole('button', { name: 'Создать доску' })).toHaveLength(2)
  })

  it('создаёт доску из шаблона и открывает её на странице пространства', async () => {
    let body: unknown
    serve()
    server.use(
      http.post('*/api/v1/spaces/DEV/boards', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: boards[1] }, { status: 201 })
      }),
    )
    const { router } = renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('button', { name: 'Создать доску' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Маркетинг')
    await userEvent.click(screen.getByLabelText(/Простая/))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(router.state.location.search).toBe('?board=b-narrow'))
    expect(body).toEqual({ name: 'Маркетинг', description: null, template: 'simple' })
  })
})
