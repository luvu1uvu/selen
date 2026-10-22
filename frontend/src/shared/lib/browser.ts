/** Переход браузера на адрес, который отдаёт сервер, а не SPA (ссылка на файл /files/{id}, UI-1b). */
export function openServerPage(url: string) {
  window.location.assign(url)
}

/**
 * Куда вернуться после входа, если на вход привела ссылка на файл (`/login?next=/files/<id>`, UI-1b, LATER-51). Только
 * ссылка на файл этого же приложения — любой другой адрес (чужой сайт, `//host`) игнорируется: открытого редиректа нет.
 */
export function fileReturnPath(search: string): string | null {
  const next = new URLSearchParams(search).get('next')
  return next && /^\/files\/[0-9a-z]{26}(\?download=1)?$/i.test(next) ? next : null
}
