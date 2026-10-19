import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Профиль', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member', name: 'Борис' })))

  it('меняет пароль с вводом текущего', async () => {
    let body: unknown
    server.use(
      http.put('*/api/v1/profile/password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    renderApp('/profile')

    await userEvent.type(await screen.findByLabelText('Текущий пароль'), 'old-password-1')
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'new-password-1')
    await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'new-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument()
    expect(body).toEqual({
      current_password: 'old-password-1',
      password: 'new-password-1',
      password_confirmation: 'new-password-1',
    })
  })

  it('показывает ошибку, если текущий пароль неверный', async () => {
    server.use(
      http.put('*/api/v1/profile/password', () =>
        HttpResponse.json(
          { message: 'x', errors: { current_password: ['Неверный текущий пароль.'] } },
          { status: 422 },
        ),
      ),
    )
    renderApp('/profile')

    await userEvent.type(await screen.findByLabelText('Текущий пароль'), 'wrong-password')
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'new-password-1')
    await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'new-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText('Неверный текущий пароль.')).toBeInTheDocument()
  })

  it('сохраняет имя и часовой пояс', async () => {
    let body: unknown
    server.use(
      http.patch('*/api/v1/profile', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeUser({ name: 'Борис Петров', role: 'member' }) })
      }),
    )
    renderApp('/profile')

    const name = await screen.findByLabelText('Имя')
    await userEvent.clear(name)
    await userEvent.type(name, 'Борис Петров')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Профиль сохранён')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Борис Петров', timezone: 'Europe/Moscow' })
  })

  it('участнику бейдж «Владелец» не показывается', async () => {
    renderApp('/profile')
    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument()
    expect(screen.queryByText('Владелец')).not.toBeInTheDocument()
  })

  it('бейдж «Владелец» в профиле Владельца', async () => {
    signedInAs(makeUser({ role: 'owner', name: 'Ольга' }))
    renderApp('/profile')
    const heading = await screen.findByRole('heading', { name: /Профиль/ })
    expect(heading).toHaveTextContent('ПрофильВладелец')
  })
})
