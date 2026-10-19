import { screen } from '@testing-library/react'
import { makeUser, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

// Страница, падающая при отрисовке (как доска при «Maximum update depth exceeded»)
vi.mock('@/features/profile/ProfilePage', () => ({
  ProfilePage: () => {
    throw new Error('Сбой отрисовки: секретная трассировка')
  },
}))

vi.mock('@/features/boards/BoardPage', () => ({
  BoardPage: () => {
    throw new Error('Сбой доски')
  },
}))

describe('Непойманная ошибка на странице', () => {
  it('показывает понятный экран на месте страницы, полоса разделов и дерево остаются', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    signedInAs(makeUser())
    renderApp('/profile')

    expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
    // Каркас приложения на месте
    expect(screen.getByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
    // Ни белого экрана React Router, ни трассировки — ошибка только в консоли
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
    expect(screen.queryByText(/секретная трассировка/)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Сбой отрисовки') }),
    )
    consoleError.mockRestore()
  })

  it('на странице-холсте (доска) экран ошибки — со своими отступами и прокруткой', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    signedInAs(makeUser())
    renderApp('/boards/board-1')

    const heading = await screen.findByRole('heading', { name: 'Что-то пошло не так' })
    expect(heading.closest('.overflow-y-auto')).toHaveClass('p-4')
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
