import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { currentUserKey } from '@/features/auth/queries'
import type { NavTreeNode, User } from '@/shared/types/api'
import {
  makeAdminUser,
  makeNavSpace,
  makeSpace,
  makeUser,
  NO_USER_PERMISSIONS,
  server,
} from '@/test/server'
import { renderApp } from '@/test/render'
import { installSession } from './queryClient'

/*
| Сессия вкладки (ADR-0002, «Изменения»; LATER-57): cookie сессии общие для всех вкладок браузера. Вкладка шлёт
| пользователя (X-Selen-User); если сессия уже другого (вошли в соседней вкладке), сервер ничего не выполняет —
| 409 session_changed, вкладка перечитывает пользователя и сбрасывает данные прежнего. Любая смена пользователя
| (вход, выход, принятие приглашения, завершение сессии) не оставляет данных прежнего пользователя.
*/

const SESSION_CHANGED =
  'В этом браузере выполнен вход под другим пользователем. Действие не выполнено — страница обновится под ним.'

const admin = makeUser({ id: 'admin-1', name: 'Анна Админова', role: 'admin' })
const owner = makeUser({
  id: 'owner-1',
  name: 'Ольга Владелец',
  email: 'owner@selen.test',
  role: 'owner',
})

const dev = makeSpace({ id: 's-dev', key: 'DEV', name: 'Разработка' })
/** Дерево администратора — только DEV; у Владельца — DEV и пустая папка. */
const trees: Record<string, NavTreeNode[]> = {
  [admin.id]: [makeNavSpace(dev, { id: 'n-dev' })],
  [owner.id]: [
    makeNavSpace(dev, { id: 'n-dev' }),
    {
      type: 'folder',
      id: 'f-new',
      name: 'Новые направления',
      icon: null,
      everyone: false,
      empty: true,
      children: [],
    },
  ],
}

/**
 * Сервер «браузера»: сессия одна на все вкладки. Как EnsureSessionUserMatches: запрос от имени не того пользователя,
 * чья сессия, — 409 и ничего не выполняется; гостю — 401.
 */
function serveSession() {
  const session: { user: User | null; applied: string[] } = { user: admin, applied: [] }
  const reply =
    (body: () => JsonBodyType, action?: string) =>
    ({ request }: { request: Request }) => {
      const tabUser = request.headers.get('X-Selen-User')
      if (!session.user) return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
      if (tabUser && tabUser !== session.user.id) {
        return HttpResponse.json(
          { message: SESSION_CHANGED, code: 'session_changed' },
          { status: 409 },
        )
      }
      if (action) session.applied.push(action)
      return HttpResponse.json(body())
    }

  server.use(
    // Кто вошёл, сервер говорит сам — без сверки
    http.get('*/api/v1/auth/me', () =>
      session.user
        ? HttpResponse.json({ data: session.user })
        : HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
    ),
    http.get(
      '*/api/v1/navigation',
      reply(() => ({ data: trees[session.user!.id] })),
    ),
    http.get(
      '*/api/v1/admin/navigation',
      reply(() => ({
        data: [
          {
            id: 'n-dev',
            parent_id: null,
            type: 'space',
            name: null,
            icon: null,
            depth: 1,
            archived_at: null,
            everyone: false,
            space: { id: 's-dev', key: 'DEV', name: 'Разработка', archived_at: null },
          },
          {
            id: 'f-new',
            parent_id: null,
            type: 'folder',
            name: 'Новые направления',
            icon: null,
            depth: 1,
            archived_at: null,
            everyone: false,
            space: null,
          },
        ],
        meta: { max_depth: 4 },
      })),
    ),
    http.get(
      '*/api/v1/admin/users',
      reply(() => ({
        data: [makeAdminUser({ ...session.user!, permissions: NO_USER_PERMISSIONS })],
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
      })),
    ),
    http.patch(
      '*/api/v1/profile',
      reply(() => ({ data: session.user }), 'profile'),
    ),
  )
  return session
}

async function userMenu() {
  return screen.findByRole('button', { name: 'Меню пользователя' })
}

function newFolderMark() {
  const row = within(screen.getByRole('region', { name: 'Структура' }))
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes('Новые направления'))!
  return within(row).queryByRole('img', { name: 'Не видно в вашем дереве' })
}

describe('Сессия вкладки', () => {
  it('в соседней вкладке вошёл другой пользователь — вкладка переходит к нему и не показывает данных прежнего', async () => {
    const session = serveSession()
    const user = userEvent.setup()
    renderApp('/admin/structure')

    expect(await userMenu()).toHaveTextContent('Анна Админова')
    await waitFor(() => expect(newFolderMark()).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Администрирование' }))

    // В соседней вкладке вышли и вошли Владельцем: cookie у вкладок общие
    session.user = owner
    await user.click(screen.getByRole('link', { name: 'Пользователи' }))

    await waitFor(async () => expect(await userMenu()).toHaveTextContent('Ольга Владелец'))
    expect(await screen.findByRole('button', { name: 'Передать владение' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Структура' }))
    // Значки — по дереву Владельца: пустая папка у него в дереве
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Структура' })).toHaveTextContent(
        'Новые направления',
      ),
    )
    await waitFor(() => expect(newFolderMark()).not.toBeInTheDocument())
  })

  it('действие во вкладке прежнего пользователя не выполняется от имени нового — понятное сообщение', async () => {
    const session = serveSession()
    const user = userEvent.setup()
    renderApp('/profile')

    const name = await screen.findByLabelText('Имя')
    session.user = owner
    await user.clear(name)
    await user.type(name, 'Анна Новая')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText(SESSION_CHANGED)).toBeInTheDocument()
    expect(screen.queryByText('Профиль сохранён')).not.toBeInTheDocument()
    expect(screen.queryByText('Что-то пошло не так. Попробуйте ещё раз.')).not.toBeInTheDocument()
    expect(session.applied).toEqual([])
    await waitFor(async () => expect(await userMenu()).toHaveTextContent('Ольга Владелец'))
  })

  it('принятие приглашения во вкладке, где вошёл другой, открывает приложение под новым сотрудником', async () => {
    const session = serveSession()
    const boris = makeUser({
      id: 'boris-1',
      name: 'Борис Новиков',
      email: 'boris@selen.test',
      role: 'member',
    })
    trees[boris.id] = []
    let tabUser: string | null = null
    server.use(
      http.get('*/api/v1/invitations/invite-token', () =>
        HttpResponse.json({
          data: {
            name: 'Борис Новиков',
            email: 'boris@selen.test',
            expires_at: '2026-10-20T10:00:00Z',
          },
        }),
      ),
      http.post('*/api/v1/invitations/invite-token/accept', ({ request }) => {
        // Вкладка Анны, её же сессия — запрос выполняется и меняет пользователя сессии
        tabUser = request.headers.get('X-Selen-User')
        session.user = boris
        return HttpResponse.json({ data: boris })
      }),
    )
    const user = userEvent.setup()
    const { router } = renderApp('/invitations/invite-token')

    await user.type(await screen.findByLabelText('Пароль'), 'strong-password-1')
    await user.type(screen.getByLabelText('Повторите пароль'), 'strong-password-1')
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль и войти' }))

    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(await userMenu()).toHaveTextContent('Борис Новиков')
    expect(tabUser).toBe(admin.id)
  })

  it('сессия закончилась — данные прежнего пользователя сброшены, после входа другим — только его данные', async () => {
    const session = serveSession()
    server.use(
      http.post('*/api/v1/auth/login', () => {
        session.user = owner
        return HttpResponse.json({ data: owner })
      }),
    )
    const user = userEvent.setup()
    const { queryClient, router } = renderApp('/admin/structure')
    await waitFor(() => expect(newFolderMark()).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Администрирование' }))
    expect(queryClient.getQueryData(['spaces', 'navigation'])).toEqual(trees[admin.id])

    // Сессия истекла: следующий запрос — 401, вкладка уходит на вход и забывает данные администратора
    session.user = null
    await user.click(screen.getByRole('link', { name: 'Пользователи' }))
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument()
    expect(queryClient.getQueryData(['spaces', 'navigation'])).toBeUndefined()
    expect(queryClient.getQueryData(['admin', 'navigation'])).toBeUndefined()

    await user.type(screen.getByLabelText('Email'), 'owner@selen.test')
    await user.type(screen.getByLabelText('Пароль'), 'password-123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await userMenu()).toHaveTextContent('Ольга Владелец')
    // На страницу, где была вкладка, возвращается только тот же пользователь; другой — на главную (аудит LATER-104, S-2)
    expect(router.state.location.pathname).toBe('/')
    await waitFor(() =>
      expect(queryClient.getQueryData(['spaces', 'navigation'])).toEqual(trees[owner.id]),
    )
  })

  it('сессия закончилась, вошёл тот же пользователь — он снова на той же странице (LATER-104)', async () => {
    const session = serveSession()
    server.use(
      http.post('*/api/v1/auth/login', () => {
        session.user = admin
        return HttpResponse.json({ data: admin })
      }),
    )
    const user = userEvent.setup()
    const { router } = renderApp('/admin/structure')
    await waitFor(() => expect(newFolderMark()).toBeInTheDocument())

    session.user = null
    await user.click(screen.getByRole('button', { name: 'Администрирование' }))
    await user.click(screen.getByRole('link', { name: 'Пользователи' }))
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'admin@selen.test')
    await user.type(screen.getByLabelText('Пароль'), 'password-123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
  })

  it('запрос ушёл без пользователя вкладки (409 session_unverified) — данные перезагружаются', async () => {
    serveSession()
    let attempts = 0
    server.use(
      http.get('*/api/v1/navigation', () => {
        attempts++
        return attempts === 1
          ? HttpResponse.json(
              {
                message: 'Страница устарела. Действие не выполнено — обновите страницу.',
                code: 'session_unverified',
              },
              { status: 409 },
            )
          : HttpResponse.json({ data: trees[admin.id] })
      }),
    )
    const { queryClient } = renderApp('/admin/structure')

    await waitFor(() =>
      expect(queryClient.getQueryData(['spaces', 'navigation'])).toEqual(trees[admin.id]),
    )
    expect(attempts).toBe(2)
    expect(await userMenu()).toHaveTextContent('Анна Админова')
  })

  it('установка поверх уже известного пользователя замечает первую же смену', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(currentUserKey, admin)
    queryClient.setQueryData(['spaces', 'navigation'], trees[admin.id])
    const uninstall = installSession(queryClient)

    queryClient.setQueryData(currentUserKey, owner)

    expect(queryClient.getQueryData(['spaces', 'navigation'])).toBeUndefined()
    uninstall()
  })
})
