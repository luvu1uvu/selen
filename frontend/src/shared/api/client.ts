import axios from 'axios'

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
