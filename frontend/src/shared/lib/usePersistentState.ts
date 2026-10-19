import { useCallback, useState } from 'react'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * Состояние, которое запоминается в браузере (localStorage): свёрнута ли панель, раскрытые папки.
 * Только для удобства одного пользователя на одном устройстве — если хранилище недоступно (приватный
 * режим, запрет), работает как обычное состояние.
 */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback))

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // Хранилище недоступно — значение живёт до перезагрузки страницы
        }
        return resolved
      })
    },
    [key],
  )

  return [value, update] as const
}
