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

    // Порядок: название, точка, счётчик; число карточек — формой множественного числа
    const name = within(columns()).getByText('To Do')
    const [count] = within(columns()).getAllByText('1 карточка')
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

  it('«+» в заголовке — подсказка Tooltip, а не title', async () => {
    renderApp('/boards/board-1')
    const add = await screen.findByRole('button', { name: 'Добавить карточку в начало To Do' })
    expect(add).not.toHaveAttribute('title')
    await userEvent.setup().hover(add)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Добавить карточку в начало To Do')
  })
})
