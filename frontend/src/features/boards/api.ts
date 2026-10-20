import { api } from '@/shared/api/client'
import type {
  BoardDetail,
  BoardSummary,
  BoardTemplate,
  Collection,
  ColumnCategory,
  Resource,
  SpaceBoard,
} from '@/shared/types/api'

/** Соседи для позиционирования: сервер сам разберётся, если они устарели (ADR-0007). */
export interface Neighbours {
  after_id?: string | null
  before_id?: string | null
}

/** Все доски пространства (и архивные) в порядке раскладки: ряд, затем место в ряду (ADR-0019). */
export async function fetchSpaceBoards(spaceKey: string): Promise<SpaceBoard[]> {
  const { data } = await api.get<Collection<SpaceBoard>>(`/spaces/${spaceKey}/boards`)
  return data.data
}

export async function createBoard(
  spaceKey: string,
  payload: { name: string; description: string | null; template: BoardTemplate },
): Promise<BoardSummary> {
  const { data } = await api.post<Resource<BoardSummary>>(`/spaces/${spaceKey}/boards`, payload)
  return data.data
}

export async function fetchBoard(boardId: string): Promise<BoardDetail> {
  const { data } = await api.get<Resource<BoardDetail>>(`/boards/${boardId}`)
  return data.data
}

export async function updateBoard(
  boardId: string,
  payload: { name?: string; description?: string | null; auto_assign_on_move?: boolean },
): Promise<void> {
  await api.patch(`/boards/${boardId}`, payload)
}

/**
 * Куда переставить доску в раскладке пространства (ADR-0019): в ряд между соседями-досками или отдельным новым рядом
 * между рядами (null — с этой стороны рядов нет).
 */
export type BoardMoveTarget =
  | ({ row_id: string } & Neighbours)
  | { new_row_after_id: string | null; new_row_before_id: string | null }

/** Ответ — доска на новом месте (её ряд — настоящий id нового ряда). */
export async function moveBoard(boardId: string, target: BoardMoveTarget): Promise<BoardSummary> {
  const { data } = await api.post<Resource<BoardSummary>>(`/boards/${boardId}/move`, target)
  return data.data
}

/** Свернуть или развернуть доску у себя на странице пространства (личный вид, ADR-0019). */
export async function setBoardCollapsed(boardId: string, collapsed: boolean): Promise<void> {
  if (collapsed) await api.put(`/boards/${boardId}/collapsed`)
  else await api.delete(`/boards/${boardId}/collapsed`)
}

export async function setBoardArchived(boardId: string, archived: boolean): Promise<void> {
  await api.post(`/boards/${boardId}/${archived ? 'archive' : 'restore'}`)
}

export async function createColumn(
  boardId: string,
  payload: { name: string; category?: ColumnCategory; parent_id?: string } & Neighbours,
): Promise<void> {
  await api.post(`/boards/${boardId}/columns`, payload)
}

export async function renameColumn(columnId: string, name: string): Promise<void> {
  await api.patch(`/columns/${columnId}`, { name })
}

export async function moveColumn(columnId: string, neighbours: Neighbours): Promise<void> {
  await api.post(`/columns/${columnId}/move`, neighbours)
}

export async function changeColumnCategory(
  columnId: string,
  category: ColumnCategory,
): Promise<{ cards_affected: number }> {
  const { data } = await api.put<Resource<{ cards_affected: number }>>(
    `/columns/${columnId}/category`,
    { category },
  )
  return data.data
}

export async function archiveColumn(columnId: string): Promise<void> {
  await api.post(`/columns/${columnId}/archive`)
}

export async function createLane(boardId: string, payload: { name: string } & Neighbours) {
  await api.post(`/boards/${boardId}/lanes`, payload)
}

export async function renameLane(laneId: string, name: string): Promise<void> {
  await api.patch(`/lanes/${laneId}`, { name })
}

export async function moveLane(laneId: string, neighbours: Neighbours): Promise<void> {
  await api.post(`/lanes/${laneId}/move`, neighbours)
}

export async function archiveLane(laneId: string): Promise<void> {
  await api.post(`/lanes/${laneId}/archive`)
}

/** Свернуть или развернуть дорожку у себя (личный вид, ADR-0019). */
export async function setLaneCollapsed(laneId: string, collapsed: boolean): Promise<void> {
  if (collapsed) await api.put(`/lanes/${laneId}/collapsed`)
  else await api.delete(`/lanes/${laneId}/collapsed`)
}
