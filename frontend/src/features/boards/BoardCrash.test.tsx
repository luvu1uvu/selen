import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { makeBoardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

vi.mock('./components/BoardView', () => ({
  BoardView: () => {
    throw new Error('Maximum update depth exceeded')
  },
}))

describe('Сбой доски', () => {
  it('на месте доски — экран ошибки, шапка страницы и дерево остаются', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    signedInAs(makeUser({ role: 'member' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
    )
    renderApp('/boards/board-1')

    expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Действия с доской' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(screen.queryByText('Maximum update depth exceeded')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
