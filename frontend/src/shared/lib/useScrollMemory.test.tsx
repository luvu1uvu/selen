import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useRef } from 'react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation, useParams } from 'react-router'
import { useScrollMemory } from './useScrollMemory'

/** Страница с прокручиваемым контейнером; карточка поверх — та же страница (как /cards/KEY поверх доски). */
function Page() {
  const { pageId = '' } = useParams()
  const ref = useRef<HTMLDivElement>(null)
  useScrollMemory(ref, { name: 'canvas', page: pageId.split('-')[0] })
  return <div ref={ref} data-testid="canvas" />
}

function setup() {
  const router = createMemoryRouter([{ path: '/p/:pageId', element: <Page /> }], {
    initialEntries: ['/p/a'],
  })
  render(<RouterProvider router={router} />)
  const canvas = () => screen.getByTestId('canvas')
  const scrollTo = (top: number) => {
    canvas().scrollTop = top
    fireEvent.scroll(canvas())
  }
  return { router, canvas, scrollTo }
}

describe('useScrollMemory', () => {
  it('новая страница открывается с начала, «Назад» возвращает прежнее место', async () => {
    const { router, canvas, scrollTo } = setup()
    scrollTo(700)

    await act(() => router.navigate('/p/b'))
    expect(canvas().scrollTop).toBe(0)
    scrollTo(250)

    await act(() => router.navigate(-1))
    expect(canvas().scrollTop).toBe(700)

    await act(() => router.navigate(1))
    expect(canvas().scrollTop).toBe(250)
  })

  it('та же страница под другим адресом (карточка поверх доски) — прокрутка не сбрасывается', async () => {
    const { router, canvas, scrollTo } = setup()
    scrollTo(900)

    await act(() => router.navigate('/p/a-card'))
    expect(canvas().scrollTop).toBe(900)
    await act(() => router.navigate('/p/a'))
    expect(canvas().scrollTop).toBe(900)
  })

  it('обычная страница → страница-холст → «Назад»: место обычной страницы восстанавливается', async () => {
    // Как в AppLayout: main прокручивает обычные страницы, у страницы-холста прокрутка своя (ready=false)
    function Layout() {
      const { pathname } = useLocation()
      const ref = useRef<HTMLElement>(null)
      useScrollMemory(ref, { name: 'main', page: pathname, ready: pathname !== '/canvas' })
      return (
        <main ref={ref} data-testid="main">
          <Outlet />
        </main>
      )
    }
    const router = createMemoryRouter(
      [
        {
          element: <Layout />,
          children: [
            { path: '/structure', element: <p /> },
            { path: '/canvas', element: <p /> },
          ],
        },
      ],
      { initialEntries: ['/structure'] },
    )
    render(<RouterProvider router={router} />)
    const main = screen.getByTestId('main')
    main.scrollTop = 600
    fireEvent.scroll(main)

    await act(() => router.navigate('/canvas'))
    main.scrollTop = 0 // на холсте main не прокручивается
    await act(() => router.navigate(-1))
    expect(main.scrollTop).toBe(600)
  })

  it('новая загрузка вкладки: своё место — восстанавливается (и в StrictMode), чужой страницы — нет', () => {
    function Single({ page }: { page: string }) {
      const ref = useRef<HTMLDivElement>(null)
      useScrollMemory(ref, { name: 'fresh', page })
      return <div ref={ref} data-testid={page} />
    }
    // Первая запись вкладки — ключ default; место запомнилось на странице «доска-1»
    const first = createMemoryRouter([{ path: '*', element: <Single page="доска-1" /> }])
    const view = render(<RouterProvider router={first} />)
    const before = screen.getByTestId('доска-1')
    before.scrollTop = 450
    fireEvent.scroll(before)
    view.unmount()

    // Перезагрузка той же страницы (тот же ключ default) — место возвращается, повтор эффекта его не затирает
    const reload = createMemoryRouter([{ path: '*', element: <Single page="доска-1" /> }])
    const reloaded = render(
      <StrictMode>
        <RouterProvider router={reload} />
      </StrictMode>,
    )
    expect(screen.getByTestId('доска-1').scrollTop).toBe(450)
    reloaded.unmount()

    // Новая загрузка другой страницы с тем же ключом default — с начала
    const other = createMemoryRouter([{ path: '*', element: <Single page="доска-2" /> }])
    render(<RouterProvider router={other} />)
    expect(screen.getByTestId('доска-2').scrollTop).toBe(0)
  })
})
