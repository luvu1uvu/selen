import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { api } from './client'
import { getErrorMessage } from './errors'

const mismatch = () => HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })

/** Обновление CSRF-cookie: сервер ставит новый XSRF-TOKEN (в jsdom MSW cookie сам не ставит). */
function serveCsrfCookie(calls: { count: number }) {
  server.use(
    http.get('*/sanctum/csrf-cookie', () => {
      calls.count++
      document.cookie = 'XSRF-TOKEN=fresh; path=/'
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

describe('419 — CSRF-токен не подошёл (LATER-78)', () => {
  beforeEach(() => {
    // Чужой токен: его поставил другой экземпляр Selen на том же хосте
    document.cookie = 'XSRF-TOKEN=stale; path=/'
  })

  it('токен обновляется, тот же запрос повторяется с новым токеном — сохранение проходит', async () => {
    const csrf = { count: 0 }
    serveCsrfCookie(csrf)
    const tokens: Array<string | null> = []
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/v1/cards/DEV-1/comments', async ({ request }) => {
        tokens.push(request.headers.get('X-XSRF-TOKEN'))
        bodies.push(await request.json())
        return tokens.length === 1 ? mismatch() : HttpResponse.json({ data: { id: 'c1' } })
      }),
    )

    const response = await api.post('/cards/DEV-1/comments', { body: 'Текст' })

    expect(response.data).toEqual({ data: { id: 'c1' } })
    expect(csrf.count).toBe(1)
    expect(tokens).toEqual(['stale', 'fresh'])
    expect(bodies).toEqual([{ body: 'Текст' }, { body: 'Текст' }])
  })

  it('повтор тоже 419 — третьего запроса нет, сообщение «Сессия устарела, обновите страницу»', async () => {
    const csrf = { count: 0 }
    serveCsrfCookie(csrf)
    let requests = 0
    server.use(
      http.patch('*/api/v1/cards/DEV-1', () => {
        requests++
        return mismatch()
      }),
    )

    const error = await api.patch('/cards/DEV-1', { title: 'Новое' }).catch((e: unknown) => e)

    expect(requests).toBe(2)
    expect(csrf.count).toBe(1)
    expect(getErrorMessage(error, 'Что-то пошло не так')).toBe('Сессия устарела, обновите страницу')
  })

  it('несколько запросов с 419 одновременно — токен обновляется один раз', async () => {
    const csrf = { count: 0 }
    serveCsrfCookie(csrf)
    const seen = new Map<string, number>()
    server.use(
      http.post('*/api/v1/lanes/:id/move', ({ params }) => {
        const id = String(params.id)
        seen.set(id, (seen.get(id) ?? 0) + 1)
        return seen.get(id) === 1 ? mismatch() : HttpResponse.json({ data: {} })
      }),
    )

    await Promise.all([api.post('/lanes/a/move', {}), api.post('/lanes/b/move', {})])

    expect(csrf.count).toBe(1)
    expect(Object.fromEntries(seen)).toEqual({ a: 2, b: 2 })
  })
})
