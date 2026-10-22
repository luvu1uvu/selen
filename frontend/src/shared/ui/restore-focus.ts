import { useRef } from 'react'

/** Последний элемент с фокусом вне окон и меню — куда вернуть фокус, если окно сразу отдало его своему полю. */
let restoring = false

/**
 * Фокус вернулся на кнопку после закрытия окна (не пользователь перешёл на неё): подсказка Tooltip этой кнопки не
 * открывается — иначе следующий Esc закрыл бы подсказку, а не окно под ней (LATER-94).
 */
export function isRestoringFocus() {
  return restoring
}

/** Вернуть фокус на кнопку так, чтобы её подсказка не открылась (окно или меню закрылось, а не пользователь перешёл). */
export function restoreFocusQuietly(target: HTMLElement | null) {
  if (!target?.isConnected) return
  restoring = true
  try {
    target.focus({ preventScroll: true })
  } finally {
    restoring = false
  }
}

let lastOutside: HTMLElement | null = null
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target
      if (target instanceof HTMLElement && !target.closest('[role="dialog"], [role="menu"]'))
        lastOutside = target
    },
    true,
  )
}

/**
 * Возврат фокуса при закрытии окна. Radix возвращает фокус только на свой Trigger; окно, открытое без него (пунктом
 * меню «⋯», по адресу карточки), отдавало фокус в body — с клавиатуры терялось место (раздел 11 docs/ui-guidelines.md).
 * Запоминаем, где был фокус в момент появления окна (ref содержимого — раньше, чем Radix переведёт фокус внутрь; если
 * поле окна с автофокусом успело раньше — последний элемент вне окон), и возвращаем туда при закрытии, если элемент ещё
 * на странице.
 */
export function useRestoreFocus(onCloseAutoFocus?: (event: Event) => void) {
  const previous = useRef<HTMLElement | null>(null)
  return {
    ref: (node: HTMLElement | null) => {
      if (!node) return
      const active = document.activeElement
      previous.current =
        active instanceof HTMLElement && active !== document.body && !node.contains(active)
          ? active
          : lastOutside
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const target = previous.current
      previous.current = null
      if (!target?.isConnected) return
      event.preventDefault()
      restoreFocusQuietly(target)
    },
  }
}
