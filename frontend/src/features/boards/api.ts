import { api } from '@/shared/api/client'
import type {
  BoardDetail,
  BoardSummary,
  BoardTemplate,
  Collection,
  ColumnCategory,
  Resource,
} from '@/shared/types/api'

/** Соседи для позиционирования: сервер сам разберётся, если они устарели (ADR-0007). */
export interface Neighbours {
  after_id?: string | null
  before_id?: string | null
}

export async function fetchSpaceBoards(spaceKey: string): Promise<BoardSummary[]> {
  const { data } = await api.get<Collection<BoardSummary>>(`/spaces/${spaceKey}/boards`)
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
  payload: { name?: string; auto_assign_on_move?: boolean },
): Promise<void> {
  await api.patch(`/boards/${boardId}`, payload)
}

export async function moveBoard(boardId: string, neighbours: Neighbours): Promise<void> {
  await api.post(`/boards/${boardId}/move`, neighbours)
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
