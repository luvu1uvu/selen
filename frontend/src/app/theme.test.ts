import { QueryClient } from '@tanstack/react-query'
import { currentUserKey } from '@/features/auth/queries'
import { stubSystemTheme } from '@/test/systemTheme'
import { makeUser } from '@/test/server'
import { installTheme } from './theme'
import initScript from '../../public/theme-init.js?raw'

const root = document.documentElement
const stored = () => window.localStorage.getItem('selen.theme')

describe('Тема вкладки (installTheme, ADR-0025)', () => {
  let uninstall: (() => void) | undefined
  afterEach(() => {
    uninstall?.()
    vi.unstubAllGlobals()
  })

  it('без пользователя — копия устройства; пришёл пользователь — его тема, она же становится копией', () => {
    window.localStorage.setItem('selen.theme', 'dark')
    const queryClient = new QueryClient()
    uninstall = installTheme(queryClient)
    expect(root).toHaveClass('dark')

    queryClient.setQueryData(currentUserKey, makeUser({ theme: 'light' }))
    expect(root).not.toHaveClass('dark')
    expect(stored()).toBe('light')
  })

  it('выход и чужой ответ без темы тему не меняют', () => {
    const queryClient = new QueryClient()
    uninstall = installTheme(queryClient)
    queryClient.setQueryData(currentUserKey, makeUser({ theme: 'dark' }))
    expect(root).toHaveClass('dark')

    queryClient.setQueryData(currentUserKey, null)
    expect(root).toHaveClass('dark')
    expect(stored()).toBe('dark')
  })

  it('«Как в системе» следует за системной темой на ходу', () => {
    const system = stubSystemTheme(false)
    const queryClient = new QueryClient()
    uninstall = installTheme(queryClient)
    queryClient.setQueryData(currentUserKey, makeUser({ theme: 'system' }))
    expect(root).not.toHaveClass('dark')

    system.change(true)
    expect(root).toHaveClass('dark')
    system.change(false)
    expect(root).not.toHaveClass('dark')
  })

  it('выбор в соседней вкладке сразу виден в этой', () => {
    uninstall = installTheme(new QueryClient())
    window.dispatchEvent(new StorageEvent('storage', { key: 'selen.theme', newValue: 'dark' }))
    expect(root).toHaveClass('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'light' }))
    expect(root).toHaveClass('dark')
  })
})

/** public/theme-init.js — до загрузки кода приложения, по копии в браузере (тот же ключ и правило по умолчанию). */
describe('Тема до первой отрисовки (theme-init.js)', () => {
  const run = () => new Function(initScript)()
  afterEach(() => vi.unstubAllGlobals())

  it('сохранённая тёмная — класс dark и color-scheme: dark', () => {
    window.localStorage.setItem('selen.theme', 'dark')
    run()
    expect(root).toHaveClass('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('нет копии — светлая', () => {
    run()
    expect(root).not.toHaveClass('dark')
    expect(root.style.colorScheme).toBe('light')
  })

  it('«Как в системе» — по системной теме', () => {
    stubSystemTheme(true)
    window.localStorage.setItem('selen.theme', 'system')
    run()
    expect(root).toHaveClass('dark')
  })
})
