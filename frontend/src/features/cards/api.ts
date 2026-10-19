import { api } from '@/shared/api/client'
import type { AxiosProgressEvent } from 'axios'
import type { MentionCandidate, RichTextDoc } from '@/shared/components/rich-text/doc'
import type {
  Attachment,
  CardDetail,
  CardHistory,
  CardSummary,
  Collection,
  Comment,
  CommentList,
  Paginated,
  Resource,
} from '@/shared/types/api'
import type { Neighbours } from '@/features/boards/api'

export interface CardPlacement extends Neighbours {
  board_id?: string
  column_id: string
  lane_id: string
}

export async function fetchCard(key: string): Promise<CardDetail> {
  const { data } = await api.get<Resource<CardDetail>>(`/cards/${key}`)
  return data.data
}

export async function createCard(
  boardId: string,
  payload: { title: string; card_type_id?: string } & CardPlacement,
): Promise<CardDetail> {
  const { data } = await api.post<Resource<CardDetail>>(`/boards/${boardId}/cards`, payload)
  return data.data
}

/** Поля карточки (PATCH: только переданные). Срок — либо due_date, либо due_at. */
export interface CardUpdate {
  title?: string
  description?: RichTextDoc | null
  card_type_id?: string
  customer_id?: string
  responsible_id?: string | null
  due_date?: string | null
  due_at?: string | null
  is_urgent?: boolean
  estimate_hours?: number | null
}

export async function updateCard(key: string, payload: CardUpdate): Promise<CardDetail> {
  const { data } = await api.patch<Resource<CardDetail>>(`/cards/${key}`, payload)
  return data.data
}

export async function moveCard(key: string, placement: CardPlacement): Promise<CardDetail> {
  const { data } = await api.post<Resource<CardDetail>>(`/cards/${key}/move`, placement)
  return data.data
}

/** Удалить в корзину — только системный администратор (ADR-0015). */
export async function deleteCard(key: string): Promise<void> {
  await api.delete(`/cards/${key}`)
}

export async function setCardArchived(key: string, archived: boolean): Promise<CardDetail> {
  const { data } = await api.post<Resource<CardDetail>>(
    `/cards/${key}/${archived ? 'archive' : 'restore'}`,
  )
  return data.data
}

export async function fetchHistory(key: string): Promise<CardHistory> {
  const { data } = await api.get<CardHistory>(`/cards/${key}/history`)
  return data
}

/** Карточки пространства по номеру или названию (только видимые, не больше 20). */
export async function searchCards(spaceKey: string, search: string): Promise<CardSummary[]> {
  const { data } = await api.get<Collection<CardSummary>>(`/spaces/${spaceKey}/cards`, {
    params: { search },
  })
  return data.data
}

export async function fetchArchivedCards(
  boardId: string,
  search: string,
  page: number,
): Promise<Paginated<CardSummary>> {
  const { data } = await api.get<Paginated<CardSummary>>(`/boards/${boardId}/archived-cards`, {
    params: { search, page },
  })
  return data
}

export async function addParticipant(key: string, userId: string): Promise<CardDetail> {
  const { data } = await api.post<Resource<CardDetail>>(`/cards/${key}/participants`, {
    user_id: userId,
  })
  return data.data
}

export async function removeParticipant(key: string, userId: string): Promise<CardDetail> {
  const { data } = await api.delete<Resource<CardDetail>>(`/cards/${key}/participants/${userId}`)
  return data.data
}

/** Метки карточки целиком. */
export async function setCardLabels(key: string, labelIds: string[]): Promise<CardDetail> {
  const { data } = await api.put<Resource<CardDetail>>(`/cards/${key}/labels`, {
    label_ids: labelIds,
  })
  return data.data
}

/** Кого можно упомянуть: только те, кто видит карточку. */
export async function fetchMentionable(key: string): Promise<MentionCandidate[]> {
  const { data } = await api.get<Collection<MentionCandidate>>(`/cards/${key}/mentionable`)
  return data.data
}

// --- Комментарии -------------------------------------------------------

export async function fetchComments(key: string): Promise<CommentList> {
  const { data } = await api.get<CommentList>(`/cards/${key}/comments`)
  return data
}

export async function addComment(key: string, body: RichTextDoc): Promise<Comment> {
  const { data } = await api.post<Resource<Comment>>(`/cards/${key}/comments`, { body })
  return data.data
}

export async function updateComment(id: string, body: RichTextDoc): Promise<Comment> {
  const { data } = await api.patch<Resource<Comment>>(`/comments/${id}`, { body })
  return data.data
}

export async function deleteComment(id: string): Promise<Comment> {
  const { data } = await api.delete<Resource<Comment>>(`/comments/${id}`)
  return data.data
}

// --- Чек-листы, ссылки, вложения (ответ — карточка целиком) -----------

type CardResponse = Promise<CardDetail>

const card = async (request: Promise<{ data: Resource<CardDetail> }>): CardResponse =>
  (await request).data.data

export const checklistApi = {
  add: (key: string, title: string) => card(api.post(`/cards/${key}/checklists`, { title })),
  rename: (id: string, title: string) => card(api.patch(`/checklists/${id}`, { title })),
  remove: (id: string) => card(api.delete(`/checklists/${id}`)),
  addItem: (checklistId: string, text: string) =>
    card(api.post(`/checklists/${checklistId}/items`, { text })),
  updateItem: (id: string, payload: { text?: string; is_done?: boolean }) =>
    card(api.patch(`/checklist-items/${id}`, payload)),
  moveItem: (id: string, neighbours: { after_id?: string | null; before_id?: string | null }) =>
    card(api.post(`/checklist-items/${id}/move`, neighbours)),
  removeItem: (id: string) => card(api.delete(`/checklist-items/${id}`)),
}

export type RelationKind = 'parent' | 'child'

export const relationApi = {
  add: (key: string, payload: { card: string; kind: RelationKind }) =>
    card(api.post(`/cards/${key}/relations`, payload)),
  remove: (key: string, relationId: string) =>
    card(api.delete(`/cards/${key}/relations/${relationId}`)),
}

export const blockApi = {
  add: (key: string, payload: { reason: string | null; blocking_card: string | null }) =>
    card(api.post(`/cards/${key}/blocks`, payload)),
  resolve: (id: string) => card(api.post(`/card-blocks/${id}/resolve`)),
}

export const linkApi = {
  add: (key: string, payload: { url: string; title: string | null }) =>
    card(api.post(`/cards/${key}/links`, payload)),
  update: (id: string, payload: { url?: string; title?: string | null }) =>
    card(api.patch(`/card-links/${id}`, payload)),
  remove: (id: string) => card(api.delete(`/card-links/${id}`)),
}

export async function uploadAttachment(
  key: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<Resource<Attachment>>(`/cards/${key}/attachments`, form, {
    onUploadProgress: (event: AxiosProgressEvent) =>
      event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
  })
  return data.data
}

export const deleteAttachment = (id: string) => card(api.delete(`/attachments/${id}`))
