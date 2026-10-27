import type { QueryClient } from '@tanstack/react-query'
import { currentUserKey } from '@/features/auth/queries'
import {
  applyTheme,
  isTheme,
  onSystemThemeChange,
  readStoredTheme,
  storeTheme,
  THEME_KEY,
} from '@/shared/lib/theme'
import type { User } from '@/shared/types/api'
import { isCurrentUserKey } from './queryClient'

/**
 * Тема вкладки (ADR-0025). До загрузки кода её поставил public/theme-init.js по копии в браузере; дальше:
 * - тема пользователя приходит с сервера вместе с ним (`/auth/me`, вход, выбор в меню — запись в кэш) и становится
 *   копией: на любом компьютере — его выбор, следующая загрузка — сразу в нём. Смену пользователя (вход, выход, 401,
 *   409) ведёт installSession: тема нового пользователя приходит с его данными. Вышел — остаётся последняя тема
 *   устройства (страница входа);
 * - «Как в системе» следует за системной темой на ходу;
 * - выбор в соседней вкладке (событие `storage`) сразу виден и в этой.
 * Возвращает функцию отключения.
 */
export function installTheme(queryClient: QueryClient) {
  let theme = readStoredTheme()
  applyTheme(theme)

  const follow = (user: User | null | undefined) => {
    if (!user?.theme || user.theme === theme) return
    theme = user.theme
    storeTheme(theme)
    applyTheme(theme)
  }
  follow(queryClient.getQueryData<User | null>(currentUserKey))

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    if (!isCurrentUserKey(event.query.queryKey)) return
    follow(event.query.state.data as User | null | undefined)
  })
  const stopSystem = onSystemThemeChange(() => theme === 'system' && applyTheme(theme))
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY || !isTheme(event.newValue)) return
    theme = event.newValue
    applyTheme(theme)
    // И в данных пользователя вкладки — галочка в меню у той же темы (follow выйдет на равенстве)
    const next = theme
    queryClient.setQueryData<User | null>(currentUserKey, (user) =>
      user ? { ...user, theme: next } : user,
    )
  }
  window.addEventListener('storage', onStorage)

  return () => {
    unsubscribe()
    stopSystem()
    window.removeEventListener('storage', onStorage)
  }
}
