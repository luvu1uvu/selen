import { useSyncExternalStore } from 'react'
import type { Theme } from '@/shared/types/api'

/**
 * Тема оформления (ADR-0025): «Светлая / Тёмная / Как в системе» — выбор пользователя на сервере, копия в браузере
 * (localStorage, строкой). Копию до загрузки кода читает public/theme-init.js — ключ и правило «нет копии — светлая»
 * у них общие. Тёмная тема — класс `dark` и `color-scheme: dark` на <html> (токены — index.css, набор `.dark`).
 */
export const THEME_KEY = 'selen.theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Копия выбора в браузере; нет копии или хранилище недоступно — светлая (решение PM 21.10, LATER-89, п. 8). */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return isTheme(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

export function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Хранилище недоступно — тема держится до перезагрузки, дальше придёт с сервера
  }
}

/** Системная тема устройства (`prefers-color-scheme`); без matchMedia (jsdom) — светлая. */
export function systemTheme(): 'light' | 'dark' {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
    ? 'dark'
    : 'light'
}

/** Подписка на смену системной темы — для «Как в системе» (вечерний режим macOS и т. п.). */
export function onSystemThemeChange(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

const listeners = new Set<() => void>()

/**
 * Показать тему: класс `dark` и `color-scheme` на <html>. На время смены переходы выключены (`theme-switching`): иначе
 * цвета кнопок и полей 150 мс «перетекали» бы из одной темы в другую.
 */
export function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? systemTheme() : theme
  const root = document.documentElement
  const dark = resolved === 'dark'
  if (root.classList.contains('dark') !== dark) {
    root.classList.add('theme-switching')
    root.classList.toggle('dark', dark)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching')),
    )
  }
  root.style.colorScheme = resolved
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function shownTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Тема, которая сейчас на экране (для компонентов со своей темой — уведомления sonner). */
export function useShownTheme() {
  return useSyncExternalStore(subscribe, shownTheme, () => 'light' as const)
}
