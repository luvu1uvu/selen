import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { openServerPage } from '@/shared/lib/browser'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

// Переход к файлу — браузерный (страницу отдаёт сервер): в jsdom его нет, проверяем вызов
vi.mock('@/shared/lib/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/browser')>()),
  openServerPage: vi.fn(),
}))

const FILE = '/files/01ja0000000000000000000000'

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

  describe('ссылка на файл (UI-1b, LATER-51)', () => {
    beforeEach(() => vi.mocked(openServerPage).mockClear())

    async function signIn() {
      server.use(http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: makeUser() })))
      await userEvent.type(await screen.findByLabelText('Email'), 'admin@selen.test')
      await userEvent.type(screen.getByLabelText('Пароль'), 'correct-password')
      await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    }

    it('пришёл по ссылке на файл — после входа браузер открывает файл один раз', async () => {
      renderApp(`/login?next=${encodeURIComponent(`${FILE}?download=1`)}`)
      await signIn()

      // Документ браузер скачивает, оставаясь на странице: не вечная «Загрузка…», а подсказка и путь на главную
      expect(await screen.findByRole('heading', { name: 'Открываем файл…' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(
        'Если файл скачался, эту вкладку можно закрыть.',
      )
      expect(openServerPage).toHaveBeenCalledTimes(1)
      expect(openServerPage).toHaveBeenCalledWith(`${FILE}?download=1`)

      await userEvent.click(screen.getByRole('link', { name: 'На главную' }))
      expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
      expect(openServerPage).toHaveBeenCalledTimes(1)
    })

    it('чужой адрес в next игнорируется — главная, без перехода', async () => {
      for (const next of ['https://evil.example/files/x', '//evil.example', '/admin/users']) {
        const { unmount } = renderApp(`/login?next=${encodeURIComponent(next)}`)
        await signIn()
        expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
        unmount()
      }
      expect(openServerPage).not.toHaveBeenCalled()
    })

    it('уже вошедший на /login?next=… — сразу к файлу', async () => {
      signedInAs(makeUser())
      renderApp(`/login?next=${encodeURIComponent(FILE)}`)

      await waitFor(() => expect(openServerPage).toHaveBeenCalledWith(FILE))
      expect(await screen.findByText('Открываем файл…')).toBeInTheDocument()
      expect(openServerPage).toHaveBeenCalledTimes(1)
    })
  })
})
