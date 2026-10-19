import { fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { useSyncedScrollLeft } from './useSyncedScrollLeft'

function Board() {
  const body = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  useSyncedScrollLeft({ body, header, bar })
  return (
    <>
      <div ref={header} data-testid="header" />
      <div ref={body} data-testid="body" />
      <div ref={bar} data-testid="bar" />
    </>
  )
}

function setup() {
  const { getByTestId } = render(<Board />)
  return { body: getByTestId('body'), header: getByTestId('header'), bar: getByTestId('bar') }
}

describe('useSyncedScrollLeft', () => {
  it('прокрутка тела вбок сдвигает заголовки колонок и полосу внизу', () => {
    const { body, header, bar } = setup()
    body.scrollLeft = 300
    fireEvent.scroll(body)
    expect(header.scrollLeft).toBe(300)
    expect(bar.scrollLeft).toBe(300)
  })

  it('полоса внизу и заголовки (фокус Tab на дальней колонке) сдвигают тело', () => {
    const { body, header, bar } = setup()
    bar.scrollLeft = 120
    fireEvent.scroll(bar)
    expect(body.scrollLeft).toBe(120)
    expect(header.scrollLeft).toBe(120)

    header.scrollLeft = 40
    fireEvent.scroll(header)
    expect(body.scrollLeft).toBe(40)
    expect(bar.scrollLeft).toBe(40)
  })

  it('эхо своей синхронизации не возвращает тело назад (плавная и инерционная прокрутка не обрывается)', () => {
    const { body, header, bar } = setup()
    body.scrollLeft = 300
    fireEvent.scroll(body)
    // Пока эхо от заголовков и полосы шло, тело уехало дальше
    body.scrollLeft = 340
    fireEvent.scroll(header)
    fireEvent.scroll(bar)
    expect(body.scrollLeft).toBe(340)

    fireEvent.scroll(body)
    expect(header.scrollLeft).toBe(340)
    expect(bar.scrollLeft).toBe(340)
  })

  it('горизонтальное колесо тачпада и Shift+колесо над заголовками двигают тело', () => {
    const { body, header, bar } = setup()
    const swipe = new WheelEvent('wheel', { deltaX: 80, deltaY: 5, cancelable: true })
    header.dispatchEvent(swipe)
    expect(body.scrollLeft).toBe(80)
    expect(swipe.defaultPrevented).toBe(true)

    const shifted = new WheelEvent('wheel', {
      deltaY: 3,
      shiftKey: true,
      deltaMode: 1,
      cancelable: true,
    })
    bar.dispatchEvent(shifted)
    expect(body.scrollLeft).toBe(80 + 3 * 16)
    expect(shifted.defaultPrevented).toBe(true)
  })

  it('вертикальное колесо над заголовками не трогаем — прокручивается холст', () => {
    const { body, header } = setup()
    const vertical = new WheelEvent('wheel', { deltaX: 2, deltaY: 60, cancelable: true })
    header.dispatchEvent(vertical)
    expect(body.scrollLeft).toBe(0)
    expect(vertical.defaultPrevented).toBe(false)
  })
})
