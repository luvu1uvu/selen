import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { cell, center, glide, LAPTOP, lane, laneRow, LANES_BOARD, openLanesBoard, slotOf, toggle } from './helpers'

/**
 * ТК-L55.5 (LATER-55, шаг 2): в свёрнутую дорожку карточку не уронить случайно. Под свёрнутой «Основной» нет ни
 * карточек, ни «+ Карточка»; пока указатель с карточкой «Срочных» над полосой «Основная», место карточки (пунктирная
 * рамка) — на прежнем месте в «Срочных»; отпущенная над полосой карточка остаётся там же, числа на полосах не
 * меняются. «Продукт» → «Дорожки приёмки» (E2eSeeder): «Основная» — 3 карточки, «Срочные» — 3.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L55.5. Свёрнутая дорожка не принимает перенос и без «+ Карточка» @tc-L55.5', async ({ page }) => {
  await openLanesBoard(page)
  const main = lane(page, 'Основная')
  await expect(main.getByRole('button', { name: /^Добавить карточку в / }).first()).toBeAttached()

  // 1. Свернуть «Основная» — под её полосой нет ни карточек, ни «+ Карточка»
  await toggle(page, 'Основная', 'Свернуть').click()
  await expect(toggle(page, 'Основная', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('group', { name: /\/ Основная$/ })).toHaveCount(0)
  await expect(main.getByRole('button', { name: /^Открыть / })).toHaveCount(0)
  await expect(main.getByRole('button', { name: /^Добавить карточку в / })).toHaveCount(0)
  await expect(main.getByText('Карточка', { exact: true })).toHaveCount(0)

  // 2. Взять карточку «Срочных» и, не отпуская, подвести к полосе «Основная» (выше) — подождать
  const origin = cell(page, 'To Do / Срочные')
  const card = origin.getByRole('button', { name: /: Приёмочная срочная 1$/ })
  const name = (await card.getAttribute('aria-label'))!
  const before = (await card.boundingBox())!
  const from = center(before)
  const row = center((await laneRow(page, 'Основная').boundingBox())!)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await glide(page, from, { x: from.x, y: row.y }, 25)

  // Пока указатель над полосой «Основная», место карточки — на прежнем месте в «Срочных»
  await expect.poll(async () => (await slotOf(page, name)).map((s) => s.dashed)).toEqual([true])
  for (let sample = 0; sample < 6; sample++) {
    await page.waitForTimeout(150)
    const slots = await slotOf(page, name)
    expect(slots, `замер ${sample}`).toHaveLength(1)
    expect(slots[0].cell, `замер ${sample}`).toBe('To Do / Срочные')
    expect(slots[0].dashed, `замер ${sample}`).toBe(true)
    expect(Math.abs(slots[0].x - before.x), `замер ${sample}`).toBeLessThanOrEqual(1)
    expect(Math.abs(slots[0].y - before.y), `замер ${sample}`).toBeLessThanOrEqual(1)
  }

  // 3. Отпустить над полосой «Основная» — карточка там же, где была; числа на полосах не изменились
  await page.mouse.up()
  await expect(origin.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(origin.getByRole('button', { name, exact: true })).not.toHaveCSS('outline-style', 'dashed')
  const after = (await origin.getByRole('button', { name, exact: true }).boundingBox())!
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  await expect(laneRow(page, 'Основная')).toContainText('3 карточки')
  await expect(laneRow(page, 'Срочные')).toContainText('3 карточки')
  await page.reload()
  await expect(page.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(cell(page, 'To Do / Срочные').getByRole('button', { name, exact: true })).toBeVisible()
  await expect(laneRow(page, 'Основная')).toContainText('3 карточки')
  await expect(laneRow(page, 'Срочные')).toContainText('3 карточки')

  // 4. Развернуть «Основная» — её карточки на месте
  await toggle(page, 'Основная', 'Развернуть').click()
  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /: Приёмочная основная/ })).toHaveCount(3)
})
