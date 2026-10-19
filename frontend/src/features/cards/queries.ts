import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
} from '@tanstack/react-query'
import { boardKeys } from '@/features/boards/queries'
import type { CardDetail } from '@/shared/types/api'
import type { RichTextDoc } from '@/shared/components/rich-text/doc'
import {
  addComment,
  addParticipant,
  createCard,
  deleteCard,
  deleteComment,
  fetchComments,
  fetchMentionable,
  fetchArchivedCards,
  fetchCard,
  fetchHistory,
  searchCards,
  moveCard,
  removeParticipant,
  setCardArchived,
  setCardLabels,
  updateCard,
  updateComment,
  type CardPlacement,
  type CardUpdate,
} from './api'

export const cardKeys = {
  all: ['cards'] as const,
  detail: (key: string) => ['cards', 'detail', key] as const,
  comments: (key: string) => ['cards', 'comments', key] as const,
  mentionable: (key: string) => ['cards', 'mentionable', key] as const,
  history: (key: string) => ['cards', 'history', key] as const,
  search: (spaceKey: string, search: string) => ['cards', 'search', spaceKey, search] as const,
  archived: (boardId: string, search: string, page: number) =>
    ['cards', 'archived', boardId, search, page] as const,
}

export function useCard(key: string | undefined) {
  return useQuery({
    queryKey: cardKeys.detail(key ?? ''),
    queryFn: () => fetchCard(key!),
    enabled: !!key,
  })
}

export function useCardHistory(key: string) {
  return useQuery({ queryKey: cardKeys.history(key), queryFn: () => fetchHistory(key) })
}

/** Поиск карточки пространства для связи или блокировки; пустой запрос — последние карточки. */
export function useCardSearch(spaceKey: string, search: string, enabled = true) {
  return useQuery({
    queryKey: cardKeys.search(spaceKey, search),
    queryFn: () => searchCards(spaceKey, search),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useArchivedCards(boardId: string, search: string, page: number) {
  return useQuery({
    queryKey: cardKeys.archived(boardId, search, page),
    queryFn: () => fetchArchivedCards(boardId, search, page),
    placeholderData: keepPreviousData,
  })
}

/**
 * После изменения карточки перечитываем её, её историю, доски (могла уехать на другую), связанные
 * карточки (связь и блокировка видны с обеих сторон) и архив.
 */
export function useCardChanged() {
  const queryClient = useQueryClient()
  return (card: CardDetail) => {
    queryClient.setQueryData(cardKeys.detail(card.key), card)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: cardKeys.history(card.key) }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'cards' &&
          ['detail', 'archived', 'search'].includes(query.queryKey[1] as string) &&
          query.queryKey[2] !== card.key,
      }),
      queryClient.invalidateQueries({ queryKey: boardKeys.all }),
    ])
  }
}

export function useCreateCard(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string } & CardPlacement) => createCard(boardId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
  })
}

export function useUpdateCard(key: string) {
  const changed = useCardChanged()
  return useMutation({
    mutationFn: (payload: CardUpdate) => updateCard(key, payload),
    onSuccess: changed,
  })
}

export function useMoveCardToPlace(key: string) {
  const changed = useCardChanged()
  return useMutation({
    mutationFn: (placement: CardPlacement) => moveCard(key, placement),
    onSuccess: changed,
  })
}

export function useSetCardArchived(key: string) {
  const changed = useCardChanged()
  return useMutation({
    mutationFn: (archived: boolean) => setCardArchived(key, archived),
    onSuccess: changed,
  })
}

/**
 * Удаление в корзину (только системный администратор, ADR-0015): остальное перечитываем — у соседних карточек
 * сменились связи и блокировки. Перечитывания не ждём: вызывающий сразу закрывает панель удалённой карточки.
 * Её собственные запросы не перечитываются (будет 404, на открытой странице мелькнуло бы «Карточка не найдена»)
 * и убираются из кеша, когда панель уже закрыта.
 */
export function useDeleteCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCard,
    onSuccess: (_, key) => {
      const ofDeleted = (query: Query) => query.queryKey[0] === 'cards' && query.queryKey[2] === key
      void Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'cards' && !ofDeleted(query),
        }),
        queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      ]).then(() => queryClient.removeQueries({ predicate: ofDeleted, type: 'inactive' }))
    },
  })
}

/** Участник карточки: добавить (add = true) или убрать. */
export function useCardParticipant(key: string) {
  const changed = useCardChanged()
  return useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      add ? addParticipant(key, userId) : removeParticipant(key, userId),
    onSuccess: changed,
  })
}

export function useSetCardLabels(key: string) {
  const changed = useCardChanged()
  return useMutation({
    mutationFn: (labelIds: string[]) => setCardLabels(key, labelIds),
    onSuccess: changed,
  })
}

export function useComments(key: string) {
  return useQuery({ queryKey: cardKeys.comments(key), queryFn: () => fetchComments(key) })
}

/** Комментарий: добавить, изменить или удалить; затем — список и счётчик на доске. */
export function useCommentMutation(key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      action:
        | { kind: 'add'; body: RichTextDoc }
        | { kind: 'update'; id: string; body: RichTextDoc }
        | { kind: 'delete'; id: string },
    ) =>
      action.kind === 'add'
        ? addComment(key, action.body)
        : action.kind === 'update'
          ? updateComment(action.id, action.body)
          : deleteComment(action.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.comments(key) }),
        queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      ]),
  })
}

/** Список «кого упомянуть» — загружается при первом @ и кешируется на минуту. */
export function useMentionableLoader(key: string) {
  const queryClient = useQueryClient()
  return () =>
    queryClient.fetchQuery({
      queryKey: cardKeys.mentionable(key),
      queryFn: () => fetchMentionable(key),
      staleTime: 60_000,
    })
}

/** Любое изменение содержимого, где сервер отвечает карточкой целиком. */
export function useCardContentMutation<T>(fn: (variables: T) => Promise<CardDetail>) {
  const changed = useCardChanged()
  return useMutation({ mutationFn: fn, onSuccess: changed })
}
