/** Системная тема устройства: jsdom matchMedia не знает — подменяем, со слушателями смены. */
export function stubSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    get matches() {
      return dark
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    change(next: boolean) {
      dark = next
      listeners.forEach((listener) => listener())
    },
  }
}
