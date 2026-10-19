import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { Toaster } from '@/shared/ui/sonner'
import { makeBoardDetail } from '@/test/boards'
import { server } from '@/test/server'
import { boardKeys } from './queries'
import { useCardMove } from './useCardMove'

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const board = makeBoardDetail()
  queryClient.setQueryData(boardKeys.detail(board.id), board)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useCardMove(board.id), { wrapper })
  const cardsNow = () =>
    queryClient
      .getQueryData<typeof board>(boardKeys.detail(board.id))!
      .cards.map((c) => `${c.key}@${c.column_id}`)
  return { board, move: result.current, cardsNow }
}

describe('Оптимистичное перемещение карточки', () => {
  it('сразу переносит карточку в кеше и отправляет соседей на сервер', async () => {
    let body: unknown
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.post('*/api/v1/cards/DEV-1/move', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: {} })
      }),
    )
    const { board, move, cardsNow } = setup()

    act(() =>
      move(board.cards[0], { column_id: 'dev', lane_id: 'main', after_id: 'c2', before_id: null }),
    )

    expect(cardsNow()).toEqual(['DEV-2@dev', 'DEV-1@dev'])
    await waitFor(() =>
      expect(body).toEqual({ column_id: 'dev', lane_id: 'main', after_id: 'c2', before_id: null }),
    )
  })

  it('при ошибке откатывает доску и показывает понятное сообщение', async () => {
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.post('*/api/v1/cards/DEV-1/move', () =>
        HttpResponse.json({ message: 'Ошибка' }, { status: 500 }),
      ),
    )
    const { board, move, cardsNow } = setup()

    act(() =>
      move(board.cards[0], { column_id: 'done', lane_id: 'main', after_id: null, before_id: null }),
    )
    expect(cardsNow()).toEqual(['DEV-2@dev', 'DEV-1@done'])

    expect(
      await screen.findByText(
        'Не удалось переместить карточку. Доска обновлена — попробуйте ещё раз.',
      ),
    ).toBeInTheDocument()
    expect(cardsNow()).toEqual(['DEV-1@todo', 'DEV-2@dev'])
  })
})
