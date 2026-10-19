import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Восстановление пароля', () => {
  it('после запроса ссылки всегда показывает нейтральное сообщение', async () => {
    server.use(
      http.post('*/api/v1/auth/forgot-password', () => HttpResponse.json({ message: 'ok' })),
    )
    renderApp('/forgot-password')

    await userEvent.type(await screen.findByLabelText('Email'), 'someone@selen.test')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }))

    expect(
      await screen.findByText(/Если учётная запись с таким email существует/),
    ).toBeInTheDocument()
  })

  it('проверяет совпадение паролей на форме сброса', async () => {
    renderApp('/reset-password/token123?email=user%40selen.test')

    await userEvent.type(await screen.findByLabelText('Новый пароль'), 'new-password-1')
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'new-password-2')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument()
  })

  it('после успешного сброса отправляет на вход с сообщением', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/auth/reset-password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    renderApp('/reset-password/token123?email=user%40selen.test')

    await userEvent.type(await screen.findByLabelText('Новый пароль'), 'new-password-1')
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'new-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(await screen.findByText('Пароль изменён. Войдите с новым паролем.')).toBeInTheDocument()
    expect(body).toEqual({
      token: 'token123',
      email: 'user@selen.test',
      password: 'new-password-1',
      password_confirmation: 'new-password-1',
    })
  })
})
