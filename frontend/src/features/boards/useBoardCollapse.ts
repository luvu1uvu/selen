import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { BoardDetail, SpaceBoard } from '@/shared/types/api'
import { setBoardCollapsed } from './api'
import { boardKeys } from './queries'

/**
 * Свернуть или развернуть доску у себя на странице пространства (личный вид, ADR-0019). Список досок в кеше меняется
 * сразу; при ошибке — обратно только эта доска и сообщение. Как у дорожек (useLaneCollapse): запросы одного
 * пространства — по очереди, список перечитывается после ошибки, когда очередь закончилась. Свернули загруженную
 * доску — счётчик свёрнутой доски берётся из неё (список мог отстать: карточки добавляли после его загрузки).
 */
export function useBoardCollapse(spaceKey: string) {
  const { t } = useTranslation('boards')
  const queryClient = useQueryClient()
  const mutationKey = ['board-collapse', spaceKey]
  const refetchLater = useRef(false)

  // Ошибка — в опциях хука, а не mutate: колбэки mutate срабатывают только у последнего вызова
  const { mutate } = useMutation({
    mutationKey,
    scope: { id: mutationKey.join(':') },
    mutationFn: ({ boardId, collapsed }: { boardId: string; collapsed: boolean }) =>
      setBoardCollapsed(boardId, collapsed),
    onError: (error, { boardId, collapsed }) => {
      applyCollapsed(queryClient, spaceKey, boardId, !collapsed)
      toast.error(getErrorMessage(error, t('board.collapseFailed')))
      refetchLater.current = true
    },
    onSettled: () => {
      // Этот запрос ещё считается идущим: 1 — других в очереди нет
      if (!refetchLater.current || queryClient.isMutating({ mutationKey }) > 1) return
      refetchLater.current = false
      return queryClient.invalidateQueries({ queryKey: boardKeys.ofSpace(spaceKey) })
    },
  })

  // Одна и та же функция между отрисовками: блоки досок (memo) не перерисовываются из-за неё
  return useCallback(
    (boardId: string, collapsed: boolean) => {
      const key = boardKeys.ofSpace(spaceKey)
      if (queryClient.isFetching({ queryKey: key }) > 0) refetchLater.current = true
      void queryClient.cancelQueries({ queryKey: key })
      applyCollapsed(queryClient, spaceKey, boardId, collapsed)
      mutate({ boardId, collapsed })
    },
    [queryClient, spaceKey, mutate],
  )
}

function applyCollapsed(
  queryClient: QueryClient,
  spaceKey: string,
  boardId: string,
  collapsed: boolean,
) {
  queryClient.setQueryData<SpaceBoard[]>(boardKeys.ofSpace(spaceKey), (boards) =>
    boards?.map((board) => {
      if (board.id !== boardId) return board
      const detail = queryClient.getQueryData<BoardDetail>(boardKeys.detail(boardId))
      return { ...board, collapsed, cards_count: detail?.cards.length ?? board.cards_count }
    }),
  )
}
