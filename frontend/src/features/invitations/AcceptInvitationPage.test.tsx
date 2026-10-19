import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeUser, server } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Принятие приглашения', () => {
  it('приветствует приглашённого и после установки пароля открывает приложение', async () => {
    server.use(
      http.get('*/api/v1/invitations/good-token', () =>
        HttpResponse.json({
          data: { name: 'Борис', email: 'boris@selen.test', expires_at: '2026-10-15T10:00:00Z' },
        }),
      ),
      http.post('*/api/v1/invitations/good-token/accept', () =>
        HttpResponse.json({ data: makeUser({ name: 'Борис', role: 'member' }) }),
      ),
    )
    renderApp('/invitations/good-token')

    expect(await screen.findByText('Борис, вас пригласили в Selen')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Пароль'), 'strong-password-1')
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'strong-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль и войти' }))

    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
  })

  it.each([
    ['invitation_expired', 'Срок действия приглашения истёк'],
    ['invitation_used', 'Приглашение уже использовано'],
    ['invitation_revoked', 'Приглашение отозвано администратором'],
  ])('показывает понятную ошибку для %s', async (code, text) => {
    server.use(
      http.get('*/api/v1/invitations/bad-token', () =>
        HttpResponse.json({ message: 'x', code }, { status: 410 }),
      ),
    )
    renderApp('/invitations/bad-token')

    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument()
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
  })

  it('при ошибке сервера не называет ссылку недействительной и предлагает повторить', async () => {
    server.use(
      http.get('*/api/v1/invitations/any-token', () =>
        HttpResponse.json({ message: 'Server Error' }, { status: 502 }),
      ),
    )
    renderApp('/invitations/any-token')

    expect(await screen.findByText('Не удалось загрузить данные.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.queryByText(/недействительна/)).not.toBeInTheDocument()
  })

  it('требует пароль не короче 10 символов', async () => {
    server.use(
      http.get('*/api/v1/invitations/good-token', () =>
        HttpResponse.json({
          data: { name: 'Борис', email: 'boris@selen.test', expires_at: '2026-10-15T10:00:00Z' },
        }),
      ),
    )
    renderApp('/invitations/good-token')

    await userEvent.type(await screen.findByLabelText('Пароль'), 'short')
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль и войти' }))

    expect(await screen.findByText('Пароль должен быть не короче 10 символов')).toBeInTheDocument()
  })
})
