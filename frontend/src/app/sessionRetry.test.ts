import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { currentUserKey } from '@/features/auth/queries'
import { api } from '@/shared/api/client'
import { makeUser, server } from '@/test/server'
import { installSession } from './queryClient'

/*
| Повтор запроса после 419 (shared/api/client.ts, LATER-78) и сессия вкладки (installSession, ADR-0002, LATER-57).
| Отдельный файл: без renderApp — других перехватчиков сессии у общего клиента api нет, проверяется только этот.
*/

const admin = makeUser({ id: 'admin-1', name: 'Анна Админова', role: 'admin' })
const owner = makeUser({ id: 'owner-1', name: 'Ольга Владелец', role: 'owner' })
const SESSION_CHANGED = 'В этом браузере выполнен вход под другим пользователем.'

describe('Повтор после 419 (LATER-78) и сессия вкладки', () => {
  const mismatch = () => HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })

  it('повтор — от имени того же пользователя, даже если за время обновления токена в кэше другой', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(currentUserKey, admin)
    const uninstall = installSession(queryClient)
    const users: Array<string | null> = []
    server.use(
      http.post('*/api/v1/cards/DEV-1/comments', ({ request }) => {
        users.push(request.headers.get('X-Selen-User'))
        return users.length === 1 ? mismatch() : HttpResponse.json({ data: {} }, { status: 201 })
      }),
      http.get('*/sanctum/csrf-cookie', () => {
        // Пока обновлялся токен, вкладка узнала о входе другого пользователя в соседней вкладке
        queryClient.setQueryData(currentUserKey, owner)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await api.post('/cards/DEV-1/comments', { body: 'Текст' })

    // Сервер с сессией Владельца ответил бы 409 и ничего не выполнил — действие не уходит от чужого имени
    expect(users).toEqual([admin.id, admin.id])
    uninstall()
  })

  it('ошибка повтора обрабатывается один раз: 409 после 419 — одно перечитывание пользователя', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(currentUserKey, admin)
    const uninstall = installSession(queryClient)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let requests = 0
    server.use(
      http.post('*/api/v1/cards/DEV-1/comments', () => {
        requests++
        return requests === 1
          ? mismatch()
          : HttpResponse.json(
              { message: SESSION_CHANGED, code: 'session_changed' },
              { status: 409 },
            )
      }),
    )

    await api.post('/cards/DEV-1/comments', { body: 'Текст' }).catch(() => undefined)

    expect(requests).toBe(2)
    expect(invalidate).toHaveBeenCalledTimes(1)
    uninstall()
  })
})
