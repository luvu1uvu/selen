import { stubSystemTheme } from '@/test/systemTheme'
import { applyTheme, readStoredTheme, storeTheme, THEME_KEY } from './theme'

const root = document.documentElement

describe('Тема оформления: копия в браузере и показ (ADR-0025)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('нет копии или она испорчена — светлая; сохранённая читается', () => {
    expect(readStoredTheme()).toBe('light')
    window.localStorage.setItem(THEME_KEY, 'blue')
    expect(readStoredTheme()).toBe('light')
    storeTheme('system')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('system')
    expect(readStoredTheme()).toBe('system')
  })

  it('тёмная — класс dark и color-scheme на <html>; светлая — без класса', () => {
    applyTheme('dark')
    expect(root).toHaveClass('dark')
    expect(root.style.colorScheme).toBe('dark')

    applyTheme('light')
    expect(root).not.toHaveClass('dark')
    expect(root.style.colorScheme).toBe('light')
  })

  it('«Как в системе» — по системной теме устройства', () => {
    stubSystemTheme(true)
    applyTheme('system')
    expect(root).toHaveClass('dark')

    stubSystemTheme(false)
    applyTheme('system')
    expect(root).not.toHaveClass('dark')
  })

  it('на время смены темы переходы выключены, потом снова включены', async () => {
    applyTheme('dark')
    expect(root).toHaveClass('theme-switching')
    await vi.waitFor(() => expect(root).not.toHaveClass('theme-switching'))

    // Та же тема — ничего не переключается
    applyTheme('dark')
    expect(root).not.toHaveClass('theme-switching')
  })
})
