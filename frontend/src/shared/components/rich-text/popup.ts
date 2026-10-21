/**
 * Открытый список подсказки @ редактора. Окно карточки перехватывает Esc раньше редактора (Radix слушает keydown
 * в фазе захвата, а ProseMirror отменённое событие не обрабатывает) — поэтому список закрывается отсюда.
 * Модуль без зависимостей: окно не тянет за собой ленивый чанк редактора.
 */
let closeOpen: (() => void) | null = null

export function setOpenMentionPopup(close: (() => void) | null) {
  closeOpen = close
}

/** Закрыть открытый список подсказки; true — список был открыт. */
export function closeMentionPopup(): boolean {
  if (!closeOpen) return false
  closeOpen()
  return true
}

/** Атрибут всплывающих списков редактора: щелчок по ним — не щелчок мимо окна. */
export const RICH_TEXT_POPUP_ATTRIBUTE = 'data-rich-text-popup'
