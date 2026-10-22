import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { tabTo } from '../stage-ux1/helpers'
import { focusedInWindow, openWinBoard, tile } from './helpers'

/**
 * ТК-UI1.22: окно с клавиатуры — Tab до карточки и Enter открывают окно; Tab ходит по элементам окна сверху вниз
 * (название, номер, заказчик, …, «+», «⋯», поля) и не уходит на доску; Esc закрывает окно, рамка фокуса — на той же
 * карточке. Доска «Продукт» → «Окно» пространства WIN, карточка WIN-18 «Просто карточка» (E2eSeeder); Анна →
 * e2e-editor.
 *
 * Фокус не уходит на доску и при Shift+Tab: сразу после открытия фокус на самом окне, и Shift+Tab уводил его на
 * доску под окном (LATER-96) — проверка в конце теста, падает до исправления.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.22. Окно с клавиатуры @tc-UI1.22', async ({ page }) => {
  // 1. Доска: Tab до карточки, Enter — окно открылось
  await openWinBoard(page)
  const card = tile(page, 'Просто карточка')
  await tabTo(page, card)
  await page.keyboard.press('Enter')
  const window = page.getByRole('dialog', { name: 'Просто карточка' })
  await expect(window).toBeVisible()
  await expect(window).toBeFocused()

  // 2. Tab несколько раз — фокус ходит по элементам окна сверху вниз и не уходит на доску
  const visited: string[] = []
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    const focused = await focusedInWindow(page)
    expect(focused.inWindow, `Tab ${i + 1}: ${focused.name}`).toBe(true)
    visited.push(focused.name)
  }
  expect(visited.slice(0, 4)).toEqual([
    'Название',
    'WIN-18. Скопировать ссылку на карточку',
    'E2E Редактор — заказчик',
    visited[3],
  ])
  expect(visited[3]).toMatch(/^Создана /)
  expect(visited.slice(4, 8)).toEqual([
    'Добавить в карточку',
    'Действия с карточкой «Просто карточка»',
    'Основные параметры',
    'Переместить…',
  ])

  // Shift+Tab — обратно по тому же порядку (с лупы «Переместить…» — на «Основные параметры»). Подсказка значка в фокусе
  // с клавиатуры закрывается первым Esc — поэтому Esc жмём на кнопке без подсказки
  await page.keyboard.press('Shift+Tab')
  expect((await focusedInWindow(page)).name).toBe('Основные параметры')
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  // 3. Esc — окно закрылось, рамка фокуса — на той же карточке на доске
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await expect(card).toBeFocused()
  expect(await card.evaluate((e) => e.matches(':focus-visible'))).toBe(true)

  // Shift+Tab сразу после открытия тоже не уводит фокус на доску под окном
  await page.keyboard.press('Enter')
  await expect(window).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  const back = await focusedInWindow(page)
  expect(back.inWindow, `Shift+Tab: ${back.name}`).toBe(true)
})
