import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeBoardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

/** Строка заголовков колонок доски. */
const columns = () => document.querySelector<HTMLElement>('[data-board-columns]')!

describe('Заголовок колонки', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
    )
  })

  it('как в Kaiten: название слева, категория — точкой с подсказкой, счётчик справа (LATER-77)', async () => {
    renderApp('/boards/board-1')
    await screen.findByRole('heading', { name: 'Продукт' })

    // Текстового бейджа категории нет — точка с подписью для диктора, у колонок верхнего уровня
    expect(within(columns()).queryByText('Очередь')).not.toBeInTheDocument()
    expect(within(columns()).queryByText('В работе')).not.toBeInTheDocument()
    const queue = within(columns()).getByRole('img', { name: 'Очередь' })
    expect(within(columns()).getByRole('img', { name: 'В работе' })).toBeInTheDocument()
    expect(within(columns()).getByRole('img', { name: 'Готово' })).toBeInTheDocument()
    // Подколонки Dev и QA — без точки: категория у них от колонки
    expect(within(columns()).getAllByRole('img')).toHaveLength(3)

    // Порядок: название, точка, счётчик
    const name = within(columns()).getByText('To Do')
    const [count] = within(columns()).getAllByTitle('1 карт.')
    expect(name.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(queue.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(name).toHaveClass('flex-1')

    // Подсказка — по наведению и по фокусу (Tab), не атрибутом title
    const user = userEvent.setup()
    expect(queue).not.toHaveAttribute('title')
    await user.hover(queue)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Очередь')
    await user.unhover(queue)
    act(() => within(columns()).getByRole('img', { name: 'Готово' }).focus())
    expect(await screen.findByRole('tooltip', { name: 'Готово' })).toBeInTheDocument()
  })

  it('«⋯» колонки и дорожки — подсказка, название в «ёлочках» (LATER-75)', async () => {
    const board = makeBoardDetail()
    board.lanes = [
      { id: 'main', name: 'Основная', position: 'a0' },
      { id: 'urgent', name: 'Срочные', position: 'a1' },
    ]
    server.use(http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })))
    renderApp('/boards/board-1')
    const user = userEvent.setup()

    const column = await screen.findByRole('button', { name: 'Действия с колонкой «To Do»' })
    expect(column).not.toHaveAttribute('title')
    await user.hover(column)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Действия с колонкой «To Do»')
    await user.unhover(column)
    await user.keyboard('{Escape}')

    const lane = screen.getByRole('button', { name: 'Действия с дорожкой «Основная»' })
    await user.hover(lane)
    expect(
      await screen.findByRole('tooltip', { name: 'Действия с дорожкой «Основная»' }),
    ).toBeInTheDocument()
    // По фокусу с клавиатуры — та же подсказка: ActionsMenu.test и E2E (jsdom не отличает фокус Tab от щелчка на странице)
  })

  it('«+» в заголовке — подсказка Tooltip, а не title', async () => {
    renderApp('/boards/board-1')
    const add = await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' })
    expect(add).not.toHaveAttribute('title')
    await userEvent.setup().hover(add)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Добавить карточку в начало To Do')
  })

  describe('обрезанное название — полное в подсказке (LATER-74)', () => {
    // jsdom не считает раскладку: «не помещается» — текст длиннее 12 символов (ширина содержимого больше видимой)
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return (this.textContent?.length ?? 0) > 12 ? 200 : 50
      })
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
      const board = makeBoardDetail({ name: 'Продуктовая доска команды' })
      board.columns[0] = { ...board.columns[0], name: 'Подготовка релиза' }
      board.lanes = [
        { id: 'main', name: 'Основная', position: 'a0' },
        { id: 'urgent', name: 'Срочные исправления в проде', position: 'a1' },
      ]
      server.use(http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: board })))
    })
    afterEach(() => vi.restoreAllMocks())

    it('колонка, дорожка и доска: подсказка по наведению и по фокусу (Tab)', async () => {
      renderApp('/boards/board-1')
      const user = userEvent.setup()
      const heading = await screen.findByRole('heading', { name: 'Продуктовая доска команды' })

      const column = within(columns()).getByText('Подготовка релиза')
      expect(column).toHaveAttribute('tabindex', '0')
      expect(column).not.toHaveAttribute('title')
      await user.hover(column)
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Подготовка релиза')
      await user.unhover(column)

      const lane = within(screen.getByRole('region', { name: 'Срочные исправления в проде' }))
      const laneName = lane.getByText('Срочные исправления в проде')
      act(() => laneName.focus())
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Срочные исправления в проде')

      act(() => heading.focus())
      expect(heading).toHaveFocus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Продуктовая доска команды')
    })

    it('название целиком — без подсказки и без остановки Tab', async () => {
      renderApp('/boards/board-1')
      await screen.findByRole('heading', { name: 'Продуктовая доска команды' })
      const name = within(columns()).getByText('Done')
      expect(name).not.toHaveAttribute('tabindex')
      await userEvent.setup().hover(name)
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(screen.getByText('Основная')).not.toHaveAttribute('tabindex')
    })
  })
})
