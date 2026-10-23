import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.10 (V-2): блокировка карточкой — под рядом действий плашка «Заблокирована карточкой» с номером и названием
 * блокирующей карточки и кнопкой «Снять блокировку». Анна → e2e-editor; DEV-231 → UXB-7 «Блокируется карточкой»,
 * DEV-230 → UXB-6 «Блокирующая» (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.10. Плашка «Заблокирована карточкой …» @tc-L98.10', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-7', 'Блокируется карточкой')
  const add = window.getByRole('button', { name: 'Добавить в карточку' })

  // 1. «+» → «Остальное» → «Блокировка» → «Выбрать блокирующую карточку» → UXB-6 → «Заблокировать»
  await add.click()
  await page.getByRole('menuitem', { name: 'Блокировка' }).click()
  const form = window.getByRole('form', { name: 'Новая блокировка' })
  await form.getByRole('button', { name: 'Выбрать блокирующую карточку' }).click()
  await form.getByRole('textbox', { name: 'Найти блокирующую карточку' }).fill('UXB-6')
  await form.getByRole('list').getByRole('button').filter({ hasText: 'UXB-6' }).filter({ hasText: 'Блокирующая' }).click()
  await form.getByRole('button', { name: 'Заблокировать' }).click()
  await expect(form).toHaveCount(0)

  // Под рядом действий — плашка: «Заблокирована карточкой», номер и название, «Снять блокировку»
  const unblock = window.getByRole('button', { name: 'Снять блокировку' })
  await expect(unblock).toBeVisible()
  // Плашка — самый вложенный блок с заголовком и кнопкой
  const banner = window
    .locator('div')
    .filter({ hasText: 'Заблокирована карточкой' })
    .filter({ has: page.getByRole('button', { name: 'Снять блокировку' }) })
    .last()
  await expect(banner).toBeVisible()
  expect((await banner.innerText()).split('\n')[0].trim(), 'заголовок плашки').toBe('Заблокирована карточкой')
  await expect(banner.getByRole('link', { name: 'UXB-6' })).toBeVisible()
  await expect(banner).toContainText('Блокирующая')
  const row = (await add.boundingBox())!
  const top = (await banner.boundingBox())!
  expect(top.y, 'плашка — под рядом действий').toBeGreaterThan(row.y + row.height)
  expect(top.y).toBeLessThan(
    (await window.getByRole('button', { name: 'Основные параметры', exact: true }).boundingBox())!.y,
  )
})
