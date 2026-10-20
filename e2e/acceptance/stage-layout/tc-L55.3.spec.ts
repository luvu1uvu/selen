import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { cell, LAPTOP, lane, laneRow, LANES_BOARD, openLanesBoard, toggle } from './helpers'

/**
 * ТК-L55.3 (LATER-55, шаг 2): свернуть дорожку стрелкой ˄ — подсказка «Свернуть дорожку «Срочные»»; от дорожки
 * остаётся одна полоса (название, то же число карточек, стрелка ˅), карточек не видно; после обновления страницы
 * дорожка по-прежнему свёрнута; щелчок по названию в свёрнутой полосе её разворачивает, карточки на месте. После
 * щелчка мышью вокруг стрелки нет рамки фокуса (дополнение PM 20.10).
 * «Продукт» → «Дорожки приёмки» (E2eSeeder): «Срочные» — 3 карточки.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

const URGENT_CARDS = /: Приёмочная срочная/

test('ТК-L55.3. Свернуть дорожку — после обновления страницы она свёрнута @tc-L55.3', async ({ page }) => {
  await openLanesBoard(page)
  const urgent = lane(page, 'Срочные')
  await expect(urgent.getByRole('button', { name: URGENT_CARDS })).toHaveCount(3)

  // 1. Навести мышь на стрелку справа на полосе «Срочные» — подсказка; нажать стрелку
  const collapse = toggle(page, 'Срочные', 'Свернуть')
  await collapse.hover()
  const hint = 'Свернуть дорожку «Срочные»'
  await expect(page.getByRole('tooltip', { name: hint })).toBeAttached()
  // Подсказка видна человеку: её текст занимает место на экране (скрытая копия для скринридеров — 1 px)
  const shown = await page.getByText(hint, { exact: true }).evaluateAll((all) =>
    Math.max(...all.map((e) => e.getBoundingClientRect().width)),
  )
  expect(shown).toBeGreaterThan(40)
  await collapse.click()

  // От «Срочных» — одна полоса: название, то же число карточек, стрелка ˅; карточек дорожки не видно
  const expand = toggle(page, 'Срочные', 'Развернуть')
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  // После щелчка мышью вокруг стрелки нет рамки фокуса (рамка — только с клавиатуры, дополнение PM 20.10)
  expect(await expand.evaluate((el) => el.matches(':focus-visible'))).toBe(false)
  await expect(expand).toHaveCSS('box-shadow', 'none')
  const row = laneRow(page, 'Срочные')
  await expect(row).toHaveAttribute('data-lane-row', 'collapsed')
  await expect(row.getByText('Срочные', { exact: true })).toBeVisible()
  await expect(row.getByText('3', { exact: true })).toBeVisible()
  await expect(row).toContainText('3 карточки')
  await expect(page.getByRole('group', { name: /\/ Срочные$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: URGENT_CARDS })).toHaveCount(0)
  // Другие дорожки на месте
  await expect(cell(page, 'To Do / Основная')).toBeVisible()

  // 2. Обновить страницу — «Срочные» по-прежнему свёрнуты
  await page.reload()
  await expect(page.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('group', { name: /\/ Срочные$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: URGENT_CARDS })).toHaveCount(0)
  await expect(row).toContainText('3 карточки')

  // 3. Нажать на название «Срочные» в свёрнутой полосе — дорожка развернулась, карточки на месте
  await row.getByText('Срочные', { exact: true }).click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(cell(page, 'To Do / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(2)
  await expect(cell(page, 'In Progress / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(1)

  // Развёрнутость тоже запомнена
  await page.reload()
  await expect(cell(page, 'To Do / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(2)
})
