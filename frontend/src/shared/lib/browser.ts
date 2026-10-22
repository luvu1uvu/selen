/**
 * Переход браузера на адрес, который отдаёт сервер, а не SPA (ссылка на файл /files/{id}, UI-1b). Заменяет текущую
 * запись истории: «Назад» из открытого файла не возвращает на страницу, которая снова к нему отправит.
 */
export function openServerPage(url: string) {
  window.location.replace(url)
}

/**
 * Куда вернуться после входа, если на вход привела ссылка на файл (`/login?next=/files/<id>`, UI-1b, LATER-51). Только
 * ссылка на файл этого же приложения — любой другой адрес (чужой сайт, `//host`) игнорируется: открытого редиректа нет.
 * Регистр важен: такой адрес строит сервер (id — ULID строчными), `/FILES/…` nginx отдал бы SPA.
 */
export function fileReturnPath(search: string): string | null {
  const next = new URLSearchParams(search).get('next')
  return next && /^\/files\/[0-9a-z]{26}(\?download=1)?$/.test(next) ? next : null
}

/**
 * Скопировать текст в буфер обмена. false — браузер не дал: буфер есть только на https и localhost, пользователь мог
 * запретить доступ. Вызывающий показывает сообщение об успехе только при true.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
