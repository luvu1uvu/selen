import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { focused, tabTo } from '../stage-ux1/helpers'
import { DESKTOP } from './helpers'

/**
 * ТК-L107.1 (LATER-107): форма новой карточки, открытая «+» в заголовке колонки Backlog, после Esc возвращает фокус на
 * тот же «+»; следующий Tab ведёт дальше по доске («⋯» колонки), а не в начало страницы. «Разработка» → «Продукт» →
 * RACC «Приёмка рядов» → «Продукт» (шаблон «Разработка», E2eSeeder::acceptanceRows), отдельной страницей доски; Анна →
 * e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L107.1. Форма новой карточки: после Esc фокус на «+» @tc-L107.1', async ({ page }) => {
  // 1. Доска «Продукт»
  await openHome(page)
  await openBoard(page, 'Приёмка рядов', 'Продукт')

  // 2. Tab до «+» в заголовке Backlog, Enter — форма новой карточки
  const add = page.getByRole('button', { name: 'Добавить карточку в начало Backlog' })
  await tabTo(page, add)
  await page.keyboard.press('Enter')
  const title = page.getByRole('textbox', { name: 'Добавить карточку в начало Backlog' })
  await expect(title).toBeFocused()

  // 3. Esc — формы нет, рамка фокуса на том же «+»
  await page.keyboard.press('Escape')
  await expect(title).toHaveCount(0)
  await expect(add).toBeFocused()
  expect(await add.evaluate((e) => e.matches(':focus-visible')), 'рамка фокуса видна').toBe(true)

  // Tab — дальше по доске: «⋯» колонки Backlog, а не начало страницы
  await page.keyboard.press('Tab')
  expect(await focused(page)).toBe('Действия с колонкой «Backlog»')
})
