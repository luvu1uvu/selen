import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeUser, server } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Страница входа', () => {
  it('показывает ошибки валидации на клиенте', async () => {
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Укажите email')).toBeInTheDocument()
    expect(screen.getByText('Укажите пароль')).toBeInTheDocument()
  })

  it('показывает ошибку с сервера при неверном пароле', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            message: 'Неверный email или пароль.',
            errors: { email: ['Неверный email или пароль.'] },
          },
          { status: 422 },
        ),
      ),
    )
    renderApp('/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'user@selen.test')
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Неверный email или пароль.')).toBeInTheDocument()
  })

  it('после успешного входа открывает главную с заглушкой досок', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: makeUser() })
      }),
    )
    renderApp('/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'admin@selen.test')
    await userEvent.type(screen.getByLabelText('Пароль'), 'correct-password')
    await userEvent.click(screen.getByLabelText('Запомнить меня'))
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
    expect(body).toEqual({
      email: 'admin@selen.test',
      password: 'correct-password',
      remember: true,
    })
  })

  it('показывает сообщение о блокировке при превышении числа попыток', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(
          { message: 'Слишком много попыток входа. Повторите через 60 секунд.' },
          { status: 429 },
        ),
      ),
    )
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'user@selen.test')
    await userEvent.type(screen.getByLabelText('Пароль'), 'whatever-password')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Слишком много попыток входа'),
    )
  })
})
