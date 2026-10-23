import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsList, TabsTrigger } from './tabs'

/*
| Рамка фокуса у вкладки — только с клавиатуры (решение PM 22.10, U-1 UX-ревью LATER-91): фокус от указателя помечен
| data-pointer-focus (у такой вкладки рамка погашена), клавиша или уход фокуса пометку снимают. Сама рамка (CSS) —
| E2E e2e/tests/focus-ring.spec.ts.
*/
function renderTabs() {
  render(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">Первая</TabsTrigger>
        <TabsTrigger value="two">Вторая</TabsTrigger>
      </TabsList>
    </Tabs>,
  )
  return [screen.getByRole('tab', { name: 'Первая' }), screen.getByRole('tab', { name: 'Вторая' })]
}

describe('TabsTrigger: рамка фокуса только с клавиатуры', () => {
  it('щелчок мышью — вкладка помечена «фокус от указателя»', async () => {
    const [, second] = renderTabs()
    await userEvent.click(second)
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(second).toHaveAttribute('data-pointer-focus')
  })

  it('клавиша после щелчка снимает пометку, стрелка ведёт на соседнюю вкладку без пометки', async () => {
    const [first, second] = renderTabs()
    await userEvent.click(first)
    expect(first).toHaveAttribute('data-pointer-focus')
    await userEvent.keyboard('{ArrowRight}')
    expect(first).not.toHaveAttribute('data-pointer-focus')
    expect(second).toHaveFocus()
    expect(second).not.toHaveAttribute('data-pointer-focus')
  })

  it('уход фокуса снимает пометку', async () => {
    const [first] = renderTabs()
    await userEvent.click(first)
    fireEvent.blur(first)
    expect(first).not.toHaveAttribute('data-pointer-focus')
  })

  it('фокус с клавиатуры (Tab) — без пометки', async () => {
    const [first] = renderTabs()
    await userEvent.tab()
    expect(first).toHaveFocus()
    expect(first).not.toHaveAttribute('data-pointer-focus')
  })
})
