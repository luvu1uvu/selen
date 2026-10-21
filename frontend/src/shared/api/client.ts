import axios, { isAxiosError } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Запрос — повтор после 419 с обновлённым CSRF-токеном: второй раз не повторяем. */
    csrfRetried?: boolean
  }
}

/**
 * HTTP-клиент для API Selen.
 *
 * Аутентификация — cookie-сессии Laravel Sanctum (SPA и API на одном домене):
 * - withCredentials: браузер отправляет cookie сессии;
 * - withXSRFToken: axios кладёт значение cookie XSRF-TOKEN в заголовок X-XSRF-TOKEN.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

/** Получить CSRF-cookie. Нужно перед первым изменяющим запросом гостя (вход, сброс пароля и т. д.). */
export async function ensureCsrfCookie(): Promise<void> {
  await axios.get('/sanctum/csrf-cookie', { withCredentials: true })
}

let refreshing: Promise<void> | null = null

/** Одно обновление CSRF-cookie на все запросы, получившие 419 одновременно. */
function refreshCsrfCookie(): Promise<void> {
  refreshing ??= ensureCsrfCookie().finally(() => {
    refreshing = null
  })
  return refreshing
}

/**
 * 419 — CSRF-токен запроса не совпал с сессией: cookie XSRF-TOKEN поменял другой экземпляр Selen на том же хосте (dev
 * и стенд PM в соседних вкладках — cookie по хосту общие, порт не различается) или токен устарел. Обновляем токен и
 * повторяем тот же запрос один раз — пользователь ничего не замечает (LATER-78). Повтор снова 419 — ошибка уходит
 * дальше: getErrorMessage говорит «Сессия устарела, обновите страницу», а форма сохраняет введённое.
 */
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error) || error.response?.status !== 419) throw error
  const config = error.config
  if (!config || config.csrfRetried) throw error
  try {
    await refreshCsrfCookie()
  } catch {
    throw error
  }
  // Заголовок с прежним токеном — долой: axios поставит новый из cookie
  config.headers.delete('X-XSRF-TOKEN')
  return api.request({ ...config, csrfRetried: true })
})
