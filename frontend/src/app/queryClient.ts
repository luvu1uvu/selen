import { QueryClient, type QueryKey } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { getErrorBody, getErrorStatus } from '@/shared/api/errors'
import { currentUserKey } from '@/features/auth/queries'
import type { User } from '@/shared/types/api'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const status = getErrorStatus(error)
          if (status && status < 500) return false
          return failureCount < 2
        },
      },
    },
  })
}

export function isCurrentUserKey(queryKey: QueryKey) {
  return (
    queryKey.length === currentUserKey.length &&
    currentUserKey.every((part, i) => queryKey[i] === part)
  )
}

/** Без X-Selen-User: «кто вошёл» сервер говорит сам, а выйти можно из любой сессии. */
const WITHOUT_TAB_USER = new Set(['/auth/me', '/auth/logout'])

/**
 * Сессия вкладки (ADR-0002, «Изменения»; LATER-57). Cookie сессии общие для всех вкладок браузера, поэтому:
 * - каждый запрос сообщает серверу пользователя вкладки (X-Selen-User). Сессия уже другого пользователя (в соседней
 *   вкладке вошли под ним) — сервер ничего не выполняет и отвечает 409 session_changed; запрос без заголовка (вкладка
 *   ещё не знает пользователя или открыта до обновления кода) — 409 session_unverified. Вкладка перечитывает
 *   пользователя и данные. Ни действия, ни данных от чужого имени и ни одного действия молча;
 * - 401 — сессия истекла или пользователь деактивирован: пользователь вкладки — никто, RequireAuth отправит на вход;
 * - любая смена пользователя вкладки (вход, выход, принятие приглашения, 401, 409) сбрасывает все данные, кроме
 *   самого пользователя: следующий пользователь не видит ничего от предыдущего, открытые экраны загружаются заново.
 * Возвращает функцию отключения (для тестов и размонтирования).
 */
export function installSession(queryClient: QueryClient) {
  const request = api.interceptors.request.use((config) => {
    // Повтор после 419 (shared/api/client.ts) — от имени того же пользователя, что и исходный запрос: пока обновлялся
    // токен, в кэше мог появиться другой (вход в соседней вкладке), и действие ушло бы от его имени
    if (config.csrfRetried) return config
    const user = queryClient.getQueryData<User | null>(currentUserKey)
    if (user && !WITHOUT_TAB_USER.has(config.url ?? '')) {
      config.headers.set('X-Selen-User', user.id)
    }
    return config
  })

  const resetData = () =>
    queryClient.resetQueries({ predicate: (query) => !isCurrentUserKey(query.queryKey) })

  // Ошибка повтора после 419 (shared/api/client.ts) проходит перехватчики дважды — в повторе и в исходном запросе;
  // обрабатываем её один раз, иначе 409 перечитывал бы все данные дважды
  const handled = new WeakSet<object>()
  const response = api.interceptors.response.use(undefined, (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
      if (handled.has(error)) return Promise.reject(error)
      handled.add(error)
    }
    const status = getErrorStatus(error)
    const code = getErrorBody(error)?.code
    if (status === 401) {
      queryClient.setQueryData(currentUserKey, null)
    } else if (status === 409 && (code === 'session_changed' || code === 'session_unverified')) {
      // Перечитать пользователя (несколько 409 — одно перечитывание). Сменился — данные сбросит подписка ниже;
      // тот же (запрос ушёл без заголовка) — перезагрузить данные здесь
      const before = queryClient.getQueryData<User | null>(currentUserKey)?.id
      void queryClient
        .invalidateQueries({ queryKey: currentUserKey }, { cancelRefetch: false })
        .then(() => {
          if (queryClient.getQueryData<User | null>(currentUserKey)?.id === before) void resetData()
        })
    }
    return Promise.reject(error)
  })

  // Пользователь, данные которого сейчас в кэше; undefined — ещё не известен (первая загрузка, сбрасывать нечего)
  const cached = queryClient.getQueryData<User | null>(currentUserKey)
  let userId: string | null | undefined = cached === undefined ? undefined : (cached?.id ?? null)
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    if (!isCurrentUserKey(event.query.queryKey)) return

    const next = (event.query.state.data as User | null | undefined)?.id ?? null
    const changed = userId !== undefined && next !== userId
    userId = next
    if (changed) void resetData()
  })

  return () => {
    api.interceptors.request.eject(request)
    api.interceptors.response.eject(response)
    unsubscribe()
  }
}
