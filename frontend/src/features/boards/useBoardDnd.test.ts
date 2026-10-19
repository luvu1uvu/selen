import { act, renderHook } from '@testing-library/react'
import type { BoardCard } from '@/shared/types/api'
import { makeBoardCard, makeBoardDetail } from '@/test/boards'
import { boardKeyboardCoordinates, useBoardDnd } from './useBoardDnd'

const extra: BoardCard = makeBoardCard({
  id: 'c3',
  key: 'DEV-3',
  title: 'Третья',
  column_id: 'todo',
  position: 'a1',
})

function setup(cards: BoardCard[] = [...makeBoardDetail().cards, extra]) {
  const onMove = vi.fn()
  const hook = renderHook(() => useBoardDnd(cards, onMove))
  const handlers = () => hook.result.current.handlers
  return { hook, onMove, handlers }
}

describe('Перетаскивание карточек (логика доски)', () => {
  it('в другую ячейку поверх карточки: ячейки меняются на лету, сервер получает соседей', () => {
    const { hook, onMove, handlers } = setup()

    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    expect(hook.result.current.activeCard?.key).toBe('DEV-1')

    act(() => handlers().onDragOver({ active: { id: 'c1' }, over: { id: 'c2' } }))
    expect(hook.result.current.cells['dev:main']).toEqual(['c1', 'c2'])
    expect(hook.result.current.cells['todo:main']).toEqual(['c3'])

    act(() => handlers().onDragEnd({ active: { id: 'c1' }, over: { id: 'c2' } }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      column_id: 'dev',
      lane_id: 'main',
      after_id: 'c2',
      before_id: null,
    })
    // Пока в доску не пришли новые данные (кеш обновляет useCardMove) — раскладка после броска: карточка на новом
    // месте, а не на кадр на старом (иначе анимация броска прокручивала к нему доску, LATER-63)
    expect(hook.result.current.activeCard).toBeUndefined()
    expect(hook.result.current.cells['todo:main']).toEqual(['c3'])
    // Как ушло на сервер: после c2
    expect(hook.result.current.cells['dev:main']).toEqual(['c2', 'c1'])
  })

  it('после броска раскладка держится до новых данных доски, затем — данные сервера', () => {
    const onMove = vi.fn()
    let cards = [...makeBoardDetail().cards, extra]
    const hook = renderHook(() => useBoardDnd(cards, onMove))
    const handlers = () => hook.result.current.handlers

    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragOver({ active: { id: 'c1' }, over: { id: 'c2' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c1' }, over: { id: 'c2' } }))
    expect(hook.result.current.cells['dev:main']).toEqual(['c2', 'c1'])

    // Сервер (например, откат после ошибки) — карточка там, где говорят данные
    cards = cards.map((c) => ({ ...c }))
    hook.rerender()
    expect(hook.result.current.cells['todo:main']).toEqual(['c1', 'c3'])
  })

  it('отпустили сразу после входа в другую ячейку (переход ещё не отрисован) — перемещение не теряется', () => {
    const { onMove, handlers } = setup()

    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c1' }, over: { id: 'c2' } }))

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      column_id: 'dev',
      lane_id: 'main',
      after_id: null,
      before_id: 'c2',
    })
  })

  it('в пустую ячейку — без соседей', () => {
    const { onMove, handlers } = setup()

    act(() => handlers().onDragStart({ active: { id: 'c2' } }))
    act(() => handlers().onDragOver({ active: { id: 'c2' }, over: { id: 'done:main' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c2' }, over: { id: 'done:main' } }))

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }), {
      column_id: 'done',
      lane_id: 'main',
      after_id: null,
      before_id: null,
    })
  })

  it('перестановка внутри ячейки', () => {
    const { onMove, handlers } = setup()

    act(() => handlers().onDragStart({ active: { id: 'c3' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c3' }, over: { id: 'c1' } }))

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c3' }), {
      column_id: 'todo',
      lane_id: 'main',
      after_id: null,
      before_id: 'c1',
    })
  })

  it('карточку вернули на место или бросили мимо — запроса нет', () => {
    const { hook, onMove, handlers } = setup()

    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } }))
    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragOver({ active: { id: 'c1' }, over: { id: 'dev:main' } }))
    act(() => handlers().onDragEnd({ active: { id: 'c1' }, over: null }))
    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragOver({ active: { id: 'c1' }, over: null }))
    act(() => handlers().onDragCancel())

    expect(onMove).not.toHaveBeenCalled()
    expect(hook.result.current.cells['todo:main']).toEqual(['c1', 'c3'])
  })

  it('клик сразу после перетаскивания карточку не открывает', () => {
    vi.useFakeTimers()
    const { hook, handlers } = setup()
    const open = vi.fn()

    act(() => handlers().onDragStart({ active: { id: 'c1' } }))
    act(() => handlers().onDragCancel())
    hook.result.current.guardClick(open)('DEV-1')
    expect(open).not.toHaveBeenCalled()

    act(() => vi.runAllTimers())
    hook.result.current.guardClick(open)('DEV-1')
    expect(open).toHaveBeenCalledWith('DEV-1')
    vi.useRealTimers()
  })
})

describe('Цель перетаскивания (collisionDetection)', () => {
  type Args = Parameters<ReturnType<typeof useBoardDnd>['collisionDetection']>[0]

  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  })
  // Ячейка — droppable с id «колонка:дорожка», карточка — sortable со своей ячейкой (containerId)
  const container = (id: string, cell?: string) =>
    ({
      id,
      key: id,
      disabled: false,
      data: {
        current: cell ? { sortable: { containerId: cell, index: 0, items: [] } } : undefined,
      },
      node: { current: null },
      rect: { current: null },
    }) as unknown as Args['droppableContainers'][number]

  // Две колонки рядом; перетаскиваемая карточка (прямоугольник) почти целиком над правой колонкой
  const rects = new Map([
    ['todo:main', rect(0, 0, 270, 600)],
    ['dev:main', rect(280, 0, 270, 600)],
    ['c3', rect(0, 0, 270, 80)],
    ['c2', rect(280, 0, 270, 80)],
  ])
  const args = (pointer: { x: number; y: number } | null): Args => ({
    active: {
      id: 'c1',
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    },
    collisionRect: rect(240, 20, 270, 80),
    droppableRects: rects,
    droppableContainers: [
      container('todo:main'),
      container('dev:main'),
      container('c3', 'todo:main'),
      container('c2', 'dev:main'),
    ],
    pointerCoordinates: pointer,
  })
  const target = (pointer: { x: number; y: number } | null) =>
    setup()
      .hook.result.current.collisionDetection(args(pointer))
      .map((c) => c.id)

  it('колонку выбирает указатель, а не близость прямоугольников: сдвиги раскладки цель не меняют', () => {
    // Указатель в левой колонке — цель там, хотя карточка ближе к правой
    expect(target({ x: 100, y: 40 })).toEqual(['c3'])
    expect(target({ x: 400, y: 40 })).toEqual(['c2'])
  })

  it('над заголовком колонки (выше карточек) — эта колонка; из дорожек — ближайшая по вертикали', () => {
    expect(target({ x: 400, y: -30 })).toEqual(['c2'])

    const lanes = new Map([
      ['todo:main', rect(0, 0, 270, 300)],
      ['todo:urgent', rect(0, 340, 270, 300)],
    ])
    const { hook } = setup()
    const detect = hook.result.current.collisionDetection
    const between = (y: number) =>
      detect({
        ...args({ x: 100, y }),
        droppableRects: lanes,
        droppableContainers: [container('todo:main'), container('todo:urgent')],
      }).map((c) => c.id)
    expect(between(310)).toEqual(['todo:main'])
    expect(between(330)).toEqual(['todo:urgent'])
  })

  it('в зазоре между колонками — последняя найденная цель; без карточек в ячейке — сама ячейка', () => {
    const { hook } = setup()
    const detect = hook.result.current.collisionDetection
    expect(detect(args({ x: 100, y: 40 })).map((c) => c.id)).toEqual(['c3'])
    expect(detect(args({ x: 275, y: 40 })).map((c) => c.id)).toEqual(['c3'])

    const empty = { ...args({ x: 100, y: 300 }), droppableContainers: [container('todo:main')] }
    expect(detect(empty).map((c) => c.id)).toEqual(['todo:main'])
  })

  it('с клавиатуры (без указателя) — по центру переносимой карточки', () => {
    expect(target(null)[0]).toBe('c2')
  })

  it('с клавиатуры: высокая пустая ячейка соседней колонки — цель, хотя её углы далеко', () => {
    const { hook } = setup()
    const tall = new Map([
      ['todo:main', rect(0, 0, 270, 5000)],
      ['dev:main', rect(280, 0, 270, 5000)],
      ['c3', rect(0, 4000, 270, 80)],
    ])
    const found = hook.result.current.collisionDetection({
      ...args(null),
      collisionRect: rect(280, 4000, 270, 80),
      droppableRects: tall,
      droppableContainers: [
        container('todo:main'),
        container('dev:main'),
        container('c3', 'todo:main'),
      ],
    })
    expect(found.map((c) => c.id)).toEqual(['dev:main'])
  })
})

describe('Перенос с клавиатуры (стрелки влево и вправо)', () => {
  type Getter = typeof boardKeyboardCoordinates
  type Context = Parameters<Getter>[1]['context']

  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  })
  const container = (id: string, cell?: string) => ({
    id,
    disabled: false,
    data: { current: cell ? { sortable: { containerId: cell } } : undefined },
  })

  // Три колонки: To Do (активная c1 внизу и c3 вверху), Dev (карточка c2 на высоте 400), Done — пустая и высокая
  const rects = new Map([
    ['todo:main', rect(0, 0, 270, 3000)],
    ['dev:main', rect(280, 0, 270, 3000)],
    ['done:main', rect(560, 0, 270, 3000)],
    ['c1', rect(8, 2000, 254, 80)],
    ['c3', rect(8, 8, 254, 80)],
    ['c2', rect(288, 400, 254, 80)],
  ])
  const containers = [
    container('todo:main'),
    container('dev:main'),
    container('done:main'),
    container('c1', 'todo:main'),
    container('c3', 'todo:main'),
    container('c2', 'dev:main'),
  ]

  function move(code: string, collisionRect: ReturnType<typeof rect>) {
    const event = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent
    const context = {
      active: { id: 'c1' },
      collisionRect,
      droppableRects: rects,
      droppableContainers: { getEnabled: () => containers },
    } as unknown as Context
    return boardKeyboardCoordinates(event, {
      active: 'c1',
      context,
      currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
    })
  }

  it('вправо — к ближайшей по высоте карточке соседней колонки, хотя наложение повёрнуто и чуть левее', () => {
    // Наложение (rotate-2) левее своей колонки: карточки To Do «правее» его края, но цель — следующая колонка
    expect(move('ArrowRight', rect(4, 380, 258, 82))).toEqual({ x: 288, y: 400 })
  })

  it('в пустую высокую ячейку — на той же высоте, а не к началу колонки', () => {
    expect(move('ArrowRight', rect(288, 2000, 254, 80))).toEqual({ x: 560, y: 2000 })
  })

  it('влево — в предыдущую колонку; дальше края доски — никуда', () => {
    expect(move('ArrowLeft', rect(288, 2000, 254, 80))).toEqual({ x: 8, y: 8 })
    expect(move('ArrowLeft', rect(8, 2000, 254, 80))).toBeUndefined()
    expect(move('ArrowRight', rect(568, 100, 254, 80))).toBeUndefined()
  })
})
