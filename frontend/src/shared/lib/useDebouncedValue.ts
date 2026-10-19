import { useEffect, useState } from 'react'

/** Значение, которое меняется не чаще чем раз в delay мс (например, строка поиска перед запросом). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
