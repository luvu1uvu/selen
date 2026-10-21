import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { BoardDetail } from '@/shared/types/api'
import { makeBoardCard, makeBoardDetail, makeCardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

/*
| Дорожки — строки внутри доски и их личное сворачивание (LATER-55, ADR-0019): строка дорожки — название, счётчик
| карточек и шеврон; одна дорожка — без строки; свёрнутая — одна строка без ячеек, щелчок по ней разворачивает;
| «+» в заголовке колонки — в первую развёрнутую дорожку. Бросок в свёрнутую — useBoardDnd.test и E2E.
*/

const lanes = [
  { id: 'main', name: 'Основная', position: 'a0' },
  { id: 'urgent', name: 'Срочные', position: 'a1' },
]

function boardWithLanes(overrides: Partial<BoardDetail> = {}) {
  return makeBoardDetail({
    lanes,
    cards: [
      makeBoardCard({ id: 'c1', key: 'DEV-1', title: 'Первая', column_id: 'todo' }),
      makeBoardCard({ id: 'c2', key: 'DEV-2', title: 'Вторая', column_id: 'dev' }),
      makeBoardCard({
        id: 'c3',
        key: 'DEV-3',
        title: 'Срочная',
        column_id: 'todo',
        lane_id: 'urgent',
      }),
    ],
    ...overrides,
  })
}

/** Доска и запросы сворачивания: метод и дорожка каждого. */
function serve(board: BoardDetail, status = 204) {
  const requests: string[] = []
  server.use(
    http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })),
    http.put('*/api/v1/lanes/:lane/collapsed', ({ params }) => {
      requests.push(`PUT ${params.lane}`)
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ message: 'Ошибка сервера' }, { status })
    }),
    http.delete('*/api/v1/lanes/:lane/collapsed', ({ params }) => {
      requests.push(`DELETE ${params.lane}`)
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/v1/boards/board-1/cards', () =>
      HttpResponse.json({ data: makeCardDetail() }, { status: 201 }),
    ),
  )
  return requests
}

const lane = (name: string) => screen.getByRole('region', { name })
const cell = (name: string) => screen.queryByRole('group', { name })

describe('Доска: дорожки', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))

  it('дорожка — строка с названием, счётчиком её карточек и шевроном; под ней ячейки по колонкам', async () => {
    serve(boardWithLanes())
    renderApp('/boards/board-1')

    await screen.findByRole('heading', { name: 'Продукт' })
    expect(within(lane('Основная')).getByText('2 карточки')).toBeInTheDocument()
    expect(within(lane('Срочные')).getByText('1 карточка')).toBeInTheDocument()
    const chevron = within(lane('Срочные')).getByRole('button', {
      name: 'Свернуть дорожку «Срочные»',
    })
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    expect(chevron).not.toHaveAttribute('title')
    expect(cell('To Do / Срочные')).toBeInTheDocument()
    // Счётчики колонок — по всем дорожкам
    const columns = document.querySelector<HTMLElement>('[data-board-columns]')!
    expect(within(columns).getByText('2 карточки')).toBeInTheDocument()
  })

  it('подсказка шеврона — всплывающая (Tooltip), а не атрибут title', async () => {
    serve(boardWithLanes())
    renderApp('/boards/board-1')

    const user = userEvent.setup()
    await user.hover(await screen.findByRole('button', { name: 'Свернуть дорожку «Основная»' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Свернуть дорожку «Основная»')
  })

  it('одна дорожка — строки нет, свёрнутой она не бывает', async () => {
    serve(makeBoardDetail({ collapsed_lane_ids: ['main'] }))
    renderApp('/boards/board-1')

    await screen.findByRole('heading', { name: 'Продукт' })
    expect(screen.queryByRole('button', { name: /дорожку/ })).not.toBeInTheDocument()
    expect(cell('To Do')).toBeInTheDocument()
  })

  it('шеврон сворачивает: остаётся строка с названием и счётчиком, ячеек и «+ Карточка» нет', async () => {
    const requests = serve(boardWithLanes())
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Свернуть дорожку «Срочные»' }))

    const expand = within(lane('Срочные')).getByRole('button', {
      name: 'Развернуть дорожку «Срочные»',
    })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(within(lane('Срочные')).getByText('1 карточка')).toBeInTheDocument()
    expect(cell('To Do / Срочные')).not.toBeInTheDocument()
    expect(within(lane('Срочные')).queryByRole('button', { name: /Добавить карточку/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Открыть DEV-3: Срочная' })).not.toBeInTheDocument()
    // Другая дорожка не затронута
    expect(cell('To Do / Основная')).toBeInTheDocument()
    expect(requests).toEqual(['PUT urgent'])
  })

  it('щелчок по строке свёрнутой дорожки разворачивает её; щелчок по меню дорожки — нет', async () => {
    const requests = serve(boardWithLanes({ collapsed_lane_ids: ['urgent'] }))
    renderApp('/boards/board-1')

    await screen.findByRole('button', { name: 'Развернуть дорожку «Срочные»' })
    expect(cell('To Do / Срочные')).not.toBeInTheDocument()

    // Меню администратора на строке (у доски manage) — только меню
    await userEvent.click(
      within(lane('Срочные')).getByRole('button', { name: 'Действия с дорожкой Срочные' }),
    )
    await userEvent.keyboard('{Escape}')
    expect(requests).toEqual([])

    await userEvent.click(within(lane('Срочные')).getByText('Срочные'))
    expect(await screen.findByRole('group', { name: 'To Do / Срочные' })).toBeInTheDocument()
    expect(requests).toEqual(['DELETE urgent'])
  })

  it('ошибка сервера — дорожка снова развёрнута и сообщение', async () => {
    serve(boardWithLanes(), 500)
    renderApp('/boards/board-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Свернуть дорожку «Срочные»' }))

    expect(
      await screen.findByText('Не удалось свернуть или развернуть дорожку. Попробуйте ещё раз.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Свернуть дорожку «Срочные»' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(cell('To Do / Срочные')).toBeInTheDocument()
  })

  it('«+» в заголовке колонки — форма в первой развёрнутой дорожке, она же выбрана в форме', async () => {
    serve(boardWithLanes({ collapsed_lane_ids: ['main'] }))
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' }),
    )

    const form = within(cell('To Do / Срочные')!)
    expect(form.getByRole('combobox', { name: 'Дорожка' })).toHaveValue('urgent')
    expect(form.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })).toHaveFocus()
  })

  it('свёрнуты все дорожки — «+» разворачивает первую и открывает форму в ней (решение PM 4)', async () => {
    const requests = serve(boardWithLanes({ collapsed_lane_ids: ['main', 'urgent'] }))
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' }),
    )

    const form = within(await screen.findByRole('group', { name: 'To Do / Основная' }))
    expect(form.getByRole('combobox', { name: 'Дорожка' })).toHaveValue('main')
    expect(cell('To Do / Срочные')).not.toBeInTheDocument()
    expect(requests).toEqual(['DELETE main'])
  })

  it('быстрые переключения идут по очереди; ошибка откатывает только свою дорожку', async () => {
    const requests: string[] = []
    // Сервер помнит свёрнутые дорожки: перечитанная после ошибки доска показывает то, что на сервере
    const onServer = new Set<string>()
    let releaseFirst = () => {}
    const firstDone = new Promise<void>((resolve) => (releaseFirst = resolve))
    server.use(
      http.get('*/api/v1/boards/board-1', () =>
        HttpResponse.json({ data: boardWithLanes({ collapsed_lane_ids: [...onServer] }) }),
      ),
      // Первый запрос (свернуть «Основную») отвечает ошибкой, но не сразу
      http.put('*/api/v1/lanes/main/collapsed', async () => {
        requests.push('PUT main: начат')
        await firstDone
        requests.push('PUT main: ошибка')
        return HttpResponse.json({ message: 'Ошибка сервера' }, { status: 500 })
      }),
      http.put('*/api/v1/lanes/urgent/collapsed', () => {
        requests.push('PUT urgent')
        onServer.add('urgent')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Свернуть дорожку «Основная»' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть дорожку «Срочные»' }))
    // Обе свёрнуты сразу, второй запрос ждёт ответа на первый
    expect(
      screen.getByRole('button', { name: 'Развернуть дорожку «Основная»' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Развернуть дорожку «Срочные»' })).toBeInTheDocument()
    expect(requests).toEqual(['PUT main: начат'])

    releaseFirst()
    expect(
      await screen.findByRole('button', { name: 'Свернуть дорожку «Основная»' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await vi.waitFor(() =>
      expect(requests).toEqual(['PUT main: начат', 'PUT main: ошибка', 'PUT urgent']),
    )
    // Доска перечитана после всей очереди: «Срочные» свёрнуты и на сервере, и на экране
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Развернуть дорожку «Срочные»' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Свернуть дорожку «Основная»' })).toBeInTheDocument()
  })

  it('форма «+» привязана к дорожке: свернули её дорожку — форма закрылась, а не переехала', async () => {
    serve(boardWithLanes())
    renderApp('/boards/board-1')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' }),
    )
    expect(
      within(cell('To Do / Основная')!).getByRole('textbox', {
        name: 'Добавить карточку в начало To Do',
      }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть дорожку «Основная»' }))
    expect(
      screen.queryByRole('textbox', { name: 'Добавить карточку в начало To Do' }),
    ).not.toBeInTheDocument()

    // Развернули снова — формы нет, пока её не откроют
    await userEvent.click(screen.getByRole('button', { name: 'Развернуть дорожку «Основная»' }))
    expect(await screen.findByRole('group', { name: 'To Do / Основная' })).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Добавить карточку в начало To Do' }),
    ).not.toBeInTheDocument()
  })
})
