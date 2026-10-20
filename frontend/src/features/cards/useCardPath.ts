import { matchPath, useLocation } from 'react-router'

/**
 * Адрес карточки по ссылке внутри приложения (связи, архив карточек): на странице пространства карточка этого же
 * пространства открывается поверх неё (`/spaces/KEY/cards/KEY-N`, ADR-0019) — пользователь не уходит на страницу
 * одной доски; в остальных местах — `/cards/KEY-N` (поверх своей доски).
 */
export function useCardPath(): (key: string) => string {
  const { pathname } = useLocation()
  const space =
    matchPath('/spaces/:spaceKey', pathname) ??
    matchPath('/spaces/:spaceKey/cards/:cardKey', pathname)
  const spaceKey = space?.params.spaceKey
  return (key) =>
    spaceKey && key.startsWith(`${spaceKey}-`)
      ? `/spaces/${spaceKey}/cards/${key}`
      : `/cards/${key}`
}
