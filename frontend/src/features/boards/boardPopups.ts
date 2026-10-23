import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

/** Что открыто в шапке доски: меню «⋯» или окно описания ⓘ. */
export type BoardPopup = 'menu' | 'description' | null

/**
 * Открытые «⋯» и ⓘ шапки доски на странице пространства (LATER-99). Пока доска грузится, у неё шапка-заглушка, а с
 * приходом данных — шапка загруженной доски: другие элементы, и открытое в заглушке закрывалось само. Состояние держит
 * слот доски (`SpaceBoardSlot`), он заглушку переживает — в новой шапке то же окно открыто сразу.
 */
export const BoardPopupsContext = createContext<
  [BoardPopup, Dispatch<SetStateAction<BoardPopup>>] | null
>(null)

/**
 * Управляемое открытие окна шапки из слота доски. Без слота (страница одной доски) — пустой объект: окно открывается
 * и закрывается само, как обычно.
 */
export function useBoardPopup(popup: Exclude<BoardPopup, null>) {
  const context = useContext(BoardPopupsContext)
  if (!context) return {}
  const [open, setOpen] = context
  return {
    open: open === popup,
    // Закрылось это окно — сбросить, только если открыто всё ещё оно (а не уже соседнее)
    onOpenChange: (next: boolean) =>
      setOpen((current) => (next ? popup : current === popup ? null : current)),
  }
}
