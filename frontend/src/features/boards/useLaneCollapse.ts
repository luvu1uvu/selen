import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { BoardDetail } from '@/shared/types/api'
import { setLaneCollapsed } from './api'
import { boardKeys } from './queries'

/** Свёрнутые дорожки доски после сворачивания или разворачивания одной — в порядке дорожек. */
export function withLaneCollapsed(
  board: BoardDetail,
  laneId: string,
  collapsed: boolean,
): string[] {
  const ids = new Set(board.collapsed_lane_ids)
  if (collapsed) ids.add(laneId)
  else ids.delete(laneId)
  return board.lanes.map((lane) => lane.id).filter((id) => ids.has(id))
}

/**
 * Свернуть или развернуть дорожку у себя (личный вид, ADR-0019). Кеш доски меняется сразу; при ошибке — обратно
 * только эта дорожка (быстрые «свернуть — развернуть» соседних дорожек не откатываются вместе с ней), сообщение
 * и перезапрос доски.
 */
export function useLaneCollapse(boardId: string) {
  const { t } = useTranslation('boards')
  const queryClient = useQueryClient()
  const key = boardKeys.detail(boardId)
  const apply = (laneId: string, collapsed: boolean) =>
    queryClient.setQueryData<BoardDetail>(
      key,
      (board) =>
        board && { ...board, collapsed_lane_ids: withLaneCollapsed(board, laneId, collapsed) },
    )

  // Ошибка — в опциях хука, а не mutate: колбэки mutate срабатывают только у последнего вызова
  const mutation = useMutation({
    mutationFn: ({ laneId, collapsed }: { laneId: string; collapsed: boolean }) =>
      setLaneCollapsed(laneId, collapsed),
    onError: (error, { laneId, collapsed }) => {
      apply(laneId, !collapsed)
      toast.error(getErrorMessage(error, t('lane.collapseFailed')))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })

  return (laneId: string, collapsed: boolean) => {
    // Ответ уже начатого перезапроса доски не должен вернуть прежнее состояние поверх нового
    void queryClient.cancelQueries({ queryKey: key })
    apply(laneId, collapsed)
    mutation.mutate({ laneId, collapsed })
  }
}
