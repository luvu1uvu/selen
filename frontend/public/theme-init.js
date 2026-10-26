/*
 * Тема до первой отрисовки (ADR-0025): копия выбора пользователя — localStorage «selen.theme» (light | dark | system;
 * нет копии — светлая). Ставит класс dark и color-scheme на <html>, пока не загрузились стили и код приложения: при
 * сохранённой тёмной теме нет вспышки светлой. Отдельный файл, а не встроенный скрипт, — его не заблокирует CSP
 * script-src 'self' (LATER-86). Подключён в index.html синхронно, до стилей; дальше тему ведёт installTheme.
 */
;(function () {
  var theme = null
  try {
    theme = window.localStorage.getItem('selen.theme')
  } catch (error) {
    // хранилище недоступно (запрет браузера) — светлая
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  if (dark) root.classList.add('dark')
  root.style.colorScheme = dark ? 'dark' : 'light'
})()
