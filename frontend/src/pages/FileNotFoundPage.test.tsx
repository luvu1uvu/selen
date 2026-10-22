import { screen } from '@testing-library/react'
import { makeUser, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Страница «Файл не найден или нет доступа» (UI-1b)', () => {
  it('одна для всех причин: объясняет, что делать, и ведёт на главную', async () => {
    signedInAs(makeUser())
    renderApp('/file-not-found')

    expect(
      await screen.findByRole('heading', { name: 'Файл не найден или нет доступа' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Возможно, файл удалён или у вас нет доступа к карточке, к которой он приложен. Попросите того, кто прислал ссылку, проверить доступ.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
  })
})
