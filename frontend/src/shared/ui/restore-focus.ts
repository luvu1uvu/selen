import { useEffect, useRef, useState, type FocusEvent } from 'react'

/**
 * Встроенная форма (новая карточка, блокировка): в момент её открытия фокус ещё на кнопке, которая её открыла, — её и
 * запоминаем. Возвращённая функция — перед закрытием «Отменой», Esc или после сохранения: когда формы уже нет, фокус
 * вернётся на эту кнопку (LATER-107, U-9 UX-ревью UI-1a), а не в body или на окно — иначе Tab уводит в начало. Ушли
 * из формы сами (щелчок мимо, Tab) — фокус не трогаем. Кнопка на время формы должна остаться в документе (скрытая —
 * можно: фокус ставится после того, как форма убрана).
 */
export function useReturnFocusOnClose() {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
  )
  const returning = useRef(false)
  useEffect(() => () => void (returning.current && restoreFocusQuietly(opener)), [opener])
  return () => {
    returning.current = true
  }
}

/**
 * Подсказка кнопки меню («⋯», «+») по фокусу — только при фокусе с клавиатуры. После пункта, выбранного мышью, меню
 * возвращает фокус на кнопку, и подсказка висела бы, пока фокус не уйдёт: указатель над кнопкой не возвращался.
 * Отменённое событие фокуса Radix Tooltip пропускает; наведение подсказку открывает, как раньше.
 */
export function hideHintUnlessKeyboard(event: FocusEvent<HTMLElement>) {
  if (!event.currentTarget.matches(':focus-visible')) event.preventDefault()
}

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
