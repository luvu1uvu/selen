import { useCallback } from 'react'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { navigationKeys } from '@/features/navigation/queries'
import type { SpaceBoard } from '@/shared/types/api'
import { moveBoard, type BoardMoveTarget } from './api'
import { applyBoardMove, pendingRowId } from './layout'
import { boardKeys } from './queries'

/**
 * Перестановка доски в раскладке пространства (администратор пространства, ADR-0019): раскладка в кеше меняется
 * сразу, после ответа список перечитывается (настоящий id нового ряда, порядок с сервера). Пока перестановка не
 * закончилась вместе с перечитыванием, следующая недоступна (`moving`): она могла бы сослаться на временный ряд.
 * При ошибке — прежняя раскладка и сообщение.
 */
export function useMoveBoard(spaceKey: string) {
  const { t } = useTranslation('boards')
  const queryClient = useQueryClient()
  const key = boardKeys.ofSpace(spaceKey)
  const mutationKey = ['board-move', spaceKey]

  const { mutate } = useMutation({
    mutationKey,
    mutationFn: ({ boardId, target }: { boardId: string; target: BoardMoveTarget }) =>
      moveBoard(boardId, target),
    onMutate: async ({ boardId, target }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SpaceBoard[]>(key)
      if (previous) queryClient.setQueryData(key, applyBoardMove(previous, boardId, target))
      return { previous }
    },
    // Временный ряд — сразу на настоящий: если перечитывание не дойдёт (свернули доску, сбой сети), следующая
    // перестановка не сошлётся на несуществующий ряд
    onSuccess: (board, { boardId }) =>
      queryClient.setQueryData<SpaceBoard[]>(key, (boards) =>
        boards?.map((b) =>
          b.row_id === pendingRowId(boardId) ? { ...b, row_id: board.row_id } : b,
        ),
      ),
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
      toast.error(getErrorMessage(error, t('layout.moveFailed')))
    },
    // Ждём перечитывания: до него в кеше временный id нового ряда. Доски в дереве — в порядке раскладки. Сами доски
    // (карточки) не перечитываются: перестановка их не меняет
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: navigationKeys.tree() }),
      ]),
  })
  const moving = useIsMutating({ mutationKey }) > 0
  // Одна и та же функция, пока не началась или не закончилась перестановка: блоки досок (memo) не перерисовываются
  const move = useCallback(
    (boardId: string, target: BoardMoveTarget) => {
      // Ряд, которого на сервере ещё нет, — ждём ответа на прежнюю перестановку
      const ids =
        'row_id' in target ? [target.row_id] : [target.new_row_after_id, target.new_row_before_id]
      if (moving || ids.some((id) => id?.startsWith(pendingRowId('')))) return
      mutate({ boardId, target })
    },
    [moving, mutate],
  )

  return { moving, move }
}
