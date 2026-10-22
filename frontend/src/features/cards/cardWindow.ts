import { createContext, useContext, useEffect, useId } from 'react'
import type { Location } from 'react-router'

/**
 * Состояние записи истории с окном карточки: сколько окон карточек открыто подряд поверх страницы. Закрытие окна —
 * столько шагов назад по истории (доска на том же месте, «Вперёд» откроет карточку снова); без него (прямая ссылка) —
 * замена адреса на доску или пространство.
 */
export interface CardWindowLocationState {
  cardDepth?: number
}

export function cardDepthOf(location: Pick<Location, 'state'>): number {
  const depth = (location.state as CardWindowLocationState | null)?.cardDepth
  return typeof depth === 'number' && depth > 0 ? depth : 0
}

/** state перехода к карточке: окно поверх страницы или поверх уже открытого окна карточки. */
export function openCardState(location: Pick<Location, 'state'>): CardWindowLocationState {
  return { cardDepth: cardDepthOf(location) + 1 }
}

export interface CardWindowApi {
  /** Поле сообщает, есть ли в нём несохранённый текст. */
  setUnsaved: (id: string, unsaved: boolean) => void
}

export const CardWindowContext = createContext<CardWindowApi | null>(null)

/**
 * Поле с текстом в окне карточки сообщает окну о несохранённом тексте: закрытие окна (Esc, щелчок мимо, «Назад»,
 * переход к другой карточке) спросит «Закрыть без сохранения?» (решение PM к UI-1a). Вне окна — ничего не делает.
 */
export function useUnsavedText(unsaved: boolean) {
  const api = useContext(CardWindowContext)
  const id = useId()
  useEffect(() => {
    if (!api) return
    api.setUnsaved(id, unsaved)
    return () => api.setUnsaved(id, false)
  }, [api, id, unsaved])
}

/** Что добавляет пункт «+» окна карточки (файл — сразу выбором файла, без формы). */
export type AddKind = 'due' | 'labels' | 'checklist' | 'link' | 'parent' | 'child' | 'block'

/** state перехода к карточке с плитки доски: первое окно поверх страницы. */
export const OPEN_FROM_PAGE: CardWindowLocationState = { cardDepth: 1 }

/** Ссылка на карточку — её адрес поверх своей доски (ADR-0019). */
export function cardLink(key: string) {
  return `${window.location.origin}/cards/${key}`
}

/** Ссылка на файл вложения: откроется у того, кто видит карточку, — в браузере или скачиванием (UI-1b, LATER-51). */
export function fileLink(attachment: { url: string }) {
  return `${window.location.origin}${attachment.url}`
}

/** Перевести фокус на само окно карточки — так Esc выводит из поля, не закрывая окна (CardWindow). */
export function focusCardWindow(from: Element | null) {
  from?.closest<HTMLElement>('[data-card-window]')?.focus()
}
