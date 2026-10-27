import { expect, test, type Locator } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import { DESKTOP, moveMouseOffWindow } from '../stage-ux2/helpers'
import { BOARD, SPACE, tile } from './helpers'

/**
 * ТК-L117.1 (LATER-117): после Esc в выборе срока фокус — на кнопке срока (с рамкой, без подсказки «Изменить срок»),
 * окно карточки открыто; второй Esc закрывает окно. Анна → e2e-editor, DEV-242 → UXC-4 «Со сроком» (срок через неделю,
 * E2eSeeder::uxBatch3; тест срок не меняет).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

/** В фокусе — этот элемент, и фокус «с клавиатуры» (рамка фокуса видна, :focus-visible). */
const keyboardFocused = (locator: Locator) =>
  locator.evaluate((element) => element === document.activeElement && element.matches(':focus-visible'))

test('ТК-L117.1. После Esc в выборе срока фокус — на кнопке срока @tc-L117.1', async ({ page }) => {
  // 1. На доске «Продукт» открыть карточку со сроком
  await openHome(page)
  await openBoard(page, SPACE, BOARD)
  await tile(page, 'Со сроком').click()
  const window = page.getByRole('dialog', { name: 'Со сроком' })
  await expect(window).toBeVisible()
  // Указатель — в сторону: подсказка по наведению не должна путаться с подсказкой по фокусу
  await moveMouseOffWindow(page)
  const due = param(window, 'Срок').getByRole('button')
  await expect(due).toBeVisible()

  // 2. Tab, пока рамка фокуса не встанет на срок; Enter — панель с полем даты
  for (let presses = 0; presses < 40 && !(await keyboardFocused(due)); presses++) await page.keyboard.press('Tab')
  expect(await keyboardFocused(due), 'рамка фокуса — на сроке в строке «Срок»').toBe(true)
  await page.keyboard.press('Enter')
  const date = page.getByRole('textbox', { name: 'Дата срока' })
  await expect(date).toBeVisible()

  // 3. Esc: панель закрылась, рамка фокуса — на сроке, подсказка «Изменить срок» не открылась, окно открыто
  await page.keyboard.press('Escape')
  await expect(date).toHaveCount(0)
  await expect(due).toBeFocused()
  expect(await keyboardFocused(due), 'рамка фокуса на сроке').toBe(true)
  await expect(window).toBeVisible()
  // Подсказка по фокусу открылась бы сразу; ждём и убеждаемся, что её нет
  await page.waitForTimeout(700)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(due).toBeFocused()

  // 4. Esc ещё раз — окно карточки закрылось
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await expect(page).not.toHaveURL(/\/cards\//)
})
