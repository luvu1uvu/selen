/**
 * Щелчок или фокус в уведомлении (sonner) поверх модального окна — не «мимо окна»: уведомление нажимается (LATER-102),
 * а окно под ним не закрывается. Обёртка `onInteractOutside` у `DialogContent` и `SheetContent`: сначала обработчик
 * окна, затем — проверка уведомления.
 */
export function keepOpenOnToast<E extends Event>(handler?: (event: E) => void) {
  return (event: E) => {
    handler?.(event)
    if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) {
      event.preventDefault()
    }
  }
}
