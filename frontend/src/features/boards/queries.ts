import { createContext, useContext } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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

/**
 * Доски пространства (порядок раскладки, счётчики, личное сворачивание). Страница пространства запрашивает список
 * вместе с самим пространством, холст подключается к нему мгновением позже — staleTime, чтобы второй наблюдатель не
 * перезапрашивал только что пришедший список.
 */
export function useSpaceBoards(spaceKey: string) {
  return useQuery({
    queryKey: boardKeys.ofSpace(spaceKey),
    queryFn: () => fetchSpaceBoards(spaceKey),
    staleTime: 2_000,
  })
}

/**
 * Доска, внутри которой идёт изменение (её блок, BoardBlock): изменение структуры перечитывает её, а не все доски —
 * на странице пространства их загружено несколько (ADR-0019).
 */
export const BoardScopeContext = createContext<string | null>(null)

/**
 * Перечитать доски после изменения: boardIds — те, что изменились (перечитываются сразу), плюс списки досок
 * пространств (счётчики). Остальные доски только помечаются устаревшими и перечитаются, когда понадобятся (при
 * возврате на вкладку или следующем открытии): на странице пространства загружено несколько досок, и каждое изменение
 * карточки перечитывало бы их все. null — неизвестно, какие доски задеты: перечитать все.
 */
export function refreshBoards(queryClient: QueryClient, boardIds: string[] | null) {
  if (!boardIds) return queryClient.invalidateQueries({ queryKey: boardKeys.all })
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: boardKeys.all, refetchType: 'none' }),
    ...[...new Set(boardIds)].map((id) =>
      queryClient.invalidateQueries({ queryKey: boardKeys.detail(id) }),
    ),
    queryClient.invalidateQueries({ queryKey: ['boards', 'space'] }),
  ])
}

/** Обновить всё, где видны доски: доску изменения (или все), списки пространства, сайдбар, карточки. */
export function useInvalidateBoards() {
  const queryClient = useQueryClient()
  const boardId = useContext(BoardScopeContext)
  return () =>
    Promise.all([
      refreshBoards(queryClient, boardId ? [boardId] : null),
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
