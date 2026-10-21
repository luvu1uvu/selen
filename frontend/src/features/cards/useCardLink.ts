import { matchPath, useLocation } from 'react-router'
import { cardDepthOf, openCardState, type CardWindowLocationState } from './cardWindow'

/**
 * Ссылка на карточку внутри приложения (связи, архив карточек): на странице пространства карточка этого же
 * пространства открывается поверх неё (`/spaces/KEY/cards/KEY-N`, ADR-0019) — пользователь не уходит на страницу
 * одной доски; в остальных местах — `/cards/KEY-N` (поверх своей доски).
 *
 * Закрытие окна возвращает к странице одним действием (cardWindow.ts): `state` — сколько окон открыто подряд поверх
 * страницы. Окно, открытое по прямой ссылке, под собой страницы в истории не имеет — переход из него к другой карточке
 * заменяет адрес (`replace`), и закрытие тоже заменит адрес на доску.
 */
export function useCardLink(): (key: string) => {
  to: string
  state: CardWindowLocationState
  replace: boolean
} {
  const location = useLocation()
  const { pathname } = location
  const space =
    matchPath('/spaces/:spaceKey', pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', pathname)
  const spaceKey = space?.params.spaceKey
  const onCard =
    matchPath('/cards/:cardKey', pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', pathname)
  const direct = onCard !== null && cardDepthOf(location) === 0
  return (key) => ({
    to:
      spaceKey && key.startsWith(`${spaceKey}-`)
        ? `/spaces/${spaceKey}/cards/${key}`
        : `/cards/${key}`,
    state: direct ? {} : openCardState(location),
    replace: direct,
  })
}
