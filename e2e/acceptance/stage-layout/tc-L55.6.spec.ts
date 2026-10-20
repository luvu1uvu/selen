import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { cell, expandAllLanes, LAPTOP, openLanesBoard, toggle } from './helpers'

/**
 * ТК-L55.6 (LATER-55, шаг 2; решение PM 4): «+» в заголовке колонки открывает поле новой карточки в первой
 * развёрнутой дорожке, над полем выбрана она; если свёрнуты все дорожки — первая разворачивается сама и поле в ней.
 * «Продукт» (две дорожки) → «Дорожки приёмки» (E2eSeeder, три: «Основная», «Срочные», «Плановые»): «свернуть
 * и «Срочные»» — свернуть и «Срочные», и «Плановые», чтобы свёрнуты были все; по пути — проверка, что при свёрнутых
 * «Основной» и «Срочных» поле открывается в «Плановых».
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

const PLUS = 'Добавить карточку в начало To Do'

/** Поле новой карточки открыто в ячейке To Do дорожки и в фокусе, над ним выбрана эта дорожка. */
async function expectFormIn(page: Page, laneName: string) {
  const form = cell(page, `To Do / ${laneName}`)
  const field = form.getByRole('textbox', { name: PLUS })
  await expect(field).toBeVisible()
  await expect(field).toBeFocused()
  await expect(page.getByRole('textbox', { name: PLUS })).toHaveCount(1)
  await expect(form.locator('[data-slot="lane-value"]')).toHaveText(laneName)
  const select = form.getByRole('combobox', { name: 'Дорожка' })
  await expect
    .poll(() => select.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent))
    .toBe(laneName)
}

test('ТК-L55.6. «+» в заголовке колонки — в первую развёрнутую дорожку @tc-L55.6', async ({ page }) => {
  await openLanesBoard(page)

  // 1. Свернуть «Основная»
  await toggle(page, 'Основная', 'Свернуть').click()
  await expect(toggle(page, 'Основная', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')

  // 2. «+» в заголовке To Do — поле в To Do «Срочных», выбрана «Срочные»; Esc
  await page.getByRole('button', { name: PLUS }).click()
  await expectFormIn(page, 'Срочные')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: PLUS })).toHaveCount(0)

  // По пути: свёрнуты «Основная» и «Срочные» — поле в первой развёрнутой, «Плановых»
  await toggle(page, 'Срочные', 'Свернуть').click()
  await expect(toggle(page, 'Срочные', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: PLUS }).click()
  await expectFormIn(page, 'Плановые')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: PLUS })).toHaveCount(0)

  // 3. Свернуть и остальные — свёрнуты все дорожки
  await toggle(page, 'Плановые', 'Свернуть').click()
  await expect(page.locator('[data-board-body] [role="group"]')).toHaveCount(0)

  // 4. Снова «+» у To Do — «Основная» развернулась сама, поле в её To Do, выбрана «Основная»; Esc
  await page.getByRole('button', { name: PLUS }).click()
  await expect(toggle(page, 'Основная', 'Свернуть')).toHaveAttribute('aria-expanded', 'true')
  await expectFormIn(page, 'Основная')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: PLUS })).toHaveCount(0)

  // 5. Развернуть остальные
  await expandAllLanes(page)
})
