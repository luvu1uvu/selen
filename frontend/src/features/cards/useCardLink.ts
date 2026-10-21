import { matchPath, useLocation } from 'react-router'
import { openCardState, type CardWindowLocationState } from './cardWindow'

/**
 * Ссылка на карточку внутри приложения (связи, архив карточек): на странице пространства карточка этого же
 * пространства открывается поверх неё (`/spaces/KEY/cards/KEY-N`, ADR-0019) — пользователь не уходит на страницу
 * одной доски; в остальных местах — `/cards/KEY-N` (поверх своей доски). `state` — сколько окон карточек открыто подряд:
 * закрытие окна вернёт к странице одним шагом (cardWindow.ts).
 */
export function useCardLink(): (key: string) => { to: string; state: CardWindowLocationState } {
  const location = useLocation()
  const space =
    matchPath('/spaces/:spaceKey', location.pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', location.pathname)
  const spaceKey = space?.params.spaceKey
  return (key) => ({
    to:
      spaceKey && key.startsWith(`${spaceKey}-`)
        ? `/spaces/${spaceKey}/cards/${key}`
        : `/cards/${key}`,
    state: openCardState(location),
  })
}
