import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BoardTemplate } from '@/shared/types/api'
import { createBoard, fetchBoard, fetchSpaceBoards, updateBoard } from './api'

export const boardKeys = {
  all: ['boards'] as const,
  detail: (boardId: string) => ['boards', 'detail', boardId] as const,
  ofSpace: (spaceKey: string) => ['boards', 'space', spaceKey] as const,
}

/**
 * Доска целиком. Сервер — источник истины: перезапрашиваем при возврате на вкладку
 * (realtime появится на этапе 3).
 */
export function useBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: () => fetchBoard(boardId!),
    enabled: !!boardId,
    refetchOnWindowFocus: true,
  })
}

export function useSpaceBoards(spaceKey: string) {
  return useQuery({
    queryKey: boardKeys.ofSpace(spaceKey),
    queryFn: () => fetchSpaceBoards(spaceKey),
  })
}

/** Обновить всё, где видны доски: страницы досок, список пространства, сайдбар. */
export function useInvalidateBoards() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      queryClient.invalidateQueries({ queryKey: ['cards'] }),
    ])
}

/**
 * Любое изменение структуры (колонки, дорожки, доски): вызвать запрос и перечитать доски.
 * Возвращает мутацию над произвольной функцией — чтобы не плодить хук на каждый эндпоинт.
 */
export function useStructureMutation<TVariables, TResult = void>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const invalidate = useInvalidateBoards()
  return useMutation({ mutationFn, onSuccess: invalidate })
}

export function useCreateBoard(spaceKey: string) {
  return useStructureMutation(
    (payload: { name: string; description: string | null; template: BoardTemplate }) =>
      createBoard(spaceKey, payload),
  )
}

/** Настройка доски: автоназначение при переходе карточки в работу. */
export function useSetAutoAssign(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => updateBoard(boardId, { auto_assign_on_move: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
  })
}
