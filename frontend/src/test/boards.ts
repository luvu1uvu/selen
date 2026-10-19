import type { BoardCard, BoardDetail, CardDetail, CardHistory } from '@/shared/types/api'

/** Карточка на доске (фасад) без меток, людей и сроков. */
export function makeBoardCard(
  overrides: Partial<BoardCard> & Pick<BoardCard, 'id' | 'column_id'>,
): BoardCard {
  return {
    key: `DEV-${overrides.id}`,
    title: overrides.id,
    lane_id: 'main',
    position: 'a0',
    card_type_id: 'task',
    label_ids: [],
    responsible_id: null,
    due_date: null,
    due_at: null,
    completed_at: null,
    is_urgent: false,
    checklist: null,
    comments_count: 0,
    attachments_count: 0,
    is_blocked: false,
    can_edit: true,
    ...overrides,
  }
}

/** Доска для тестов: To Do, In Progress (с подколонками Dev и QA), Done; одна дорожка. */
export function makeBoardDetail(overrides: Partial<BoardDetail> = {}): BoardDetail {
  return {
    id: 'board-1',
    name: 'Продукт',
    description: null,
    archived_at: null,
    space: { id: 'space-1', key: 'DEV', name: 'Разработка' },
    permissions: { manage: true, edit_cards: true, delete_cards: false },
    auto_assign_on_move: true,
    has_done_column: true,
    columns: [
      { id: 'todo', parent_id: null, name: 'To Do', category: 'queue', position: 'a0' },
      {
        id: 'progress',
        parent_id: null,
        name: 'In Progress',
        category: 'in_progress',
        position: 'a1',
      },
      { id: 'dev', parent_id: 'progress', name: 'Dev', category: 'in_progress', position: 'a0' },
      { id: 'qa', parent_id: 'progress', name: 'QA', category: 'in_progress', position: 'a1' },
      { id: 'done', parent_id: null, name: 'Done', category: 'done', position: 'a2' },
    ],
    lanes: [{ id: 'main', name: 'Основная', position: 'a0' }],
    cards: [
      makeBoardCard({ id: 'c1', key: 'DEV-1', title: 'Первая', column_id: 'todo' }),
      makeBoardCard({
        id: 'c2',
        key: 'DEV-2',
        title: 'Вторая',
        column_id: 'dev',
        card_type_id: 'bug',
      }),
    ],
    card_types: [
      { id: 'task', name: 'Задача', color: '#3b82f6', is_default: true, archived_at: null },
      { id: 'bug', name: 'Баг', color: '#ef4444', is_default: false, archived_at: null },
    ],
    labels: [],
    people: [],
    ...overrides,
  }
}

export function makeCardDetail(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    id: 'c1',
    key: 'DEV-1',
    number: 1,
    title: 'Первая',
    description: null,
    mentioned_users: {},
    space: { id: 'space-1', key: 'DEV', name: 'Разработка' },
    board: { id: 'board-1', name: 'Продукт' },
    column: { id: 'todo', name: 'To Do', parent_name: null, category: 'queue' },
    lane: { id: 'main', name: 'Основная' },
    card_type: {
      id: 'task',
      name: 'Задача',
      color: '#3b82f6',
      is_default: true,
      archived_at: null,
    },
    created_by: { id: 'u1', name: 'Борис' },
    customer: { id: 'u1', name: 'Борис', status: 'active', in_space: true },
    responsible: null,
    participants: [],
    labels: [],
    due_date: null,
    due_at: null,
    is_urgent: false,
    estimate_hours: null,
    checklists: [],
    links: [],
    attachments: [],
    relations: { parents: [], children: [], progress: null },
    blocks: [],
    created_at: '2026-10-01T09:00:00.000000Z',
    first_started_at: null,
    completed_at: null,
    archived_at: null,
    metrics: { lead_time_seconds: null, cycle_time_seconds: null },
    permissions: { edit: true, comment: true, restricted: false, delete: false },
    ...overrides,
  }
}

/** Лента истории карточки: по умолчанию пустая. */
export function makeCardHistory(overrides: Partial<CardHistory> = {}): CardHistory {
  return {
    data: [],
    refs: { users: {}, card_types: {}, labels: {}, blocks: {}, cards: {} },
    ...overrides,
  }
}
