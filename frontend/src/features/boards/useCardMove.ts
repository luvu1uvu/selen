import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { moveCard } from '@/features/cards/api'
import { cardKeys } from '@/features/cards/queries'
import { getErrorMessage } from '@/shared/api/errors'
import type { BoardCard, BoardDetail } from '@/shared/types/api'
import { moveCardLocally } from './model'
import { boardKeys } from './queries'

export interface CardMoveTarget {
  column_id: string
  lane_id: string
  after_id: string | null
  before_id: string | null
}

/**
 * Перемещение карточки на доске с оптимистичным обновлением.
 * Кеш доски меняется сразу (синхронно, чтобы карточка не «прыгала» назад после отпускания),
 * при ошибке — откат, понятное сообщение и перезапрос доски. Сервер — источник истины.
 */
export function useCardMove(boardId: string) {
  const { t } = useTranslation('boards')
  const queryClient = useQueryClient()
  const key = boardKeys.detail(boardId)

  const mutation = useMutation({
    mutationFn: ({ card, target }: { card: BoardCard; target: CardMoveTarget }) =>
      moveCard(card.key, target),
    onSettled: (_data, _error, { card }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: cardKeys.detail(card.key) }),
        queryClient.invalidateQueries({ queryKey: cardKeys.history(card.key) }),
      ]),
  })

  return (card: BoardCard, target: CardMoveTarget) => {
    const previous = queryClient.getQueryData<BoardDetail>(key)
    if (previous) {
      queryClient.setQueryData<BoardDetail>(key, {
        ...previous,
        cards: moveCardLocally(previous.cards, card.id, target),
      })
    }
    void queryClient.cancelQueries({ queryKey: key })

    mutation.mutate(
      { card, target },
      {
        onError: (error) => {
          if (previous) queryClient.setQueryData(key, previous)
          toast.error(getErrorMessage(error, t('board.moveFailed')))
        },
      },
    )
  }
}
