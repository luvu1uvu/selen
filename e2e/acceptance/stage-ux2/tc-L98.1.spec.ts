import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectNewToast, trackToasts } from '../stage-ui1/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.1 (решение PM 22.10): «План, ч», пока не задан, строку не занимает; «+» → «Основное» → «План, ч» — строка
 * с полем в фокусе; 3 и Enter — «Сохранено»; стёрли и Enter — «Сохранено», строки нет. Анна → e2e-editor, DEV-231 →
 * UXB-3 «План через плюс» (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.1. «План, ч» добавляется через «+» @tc-L98.1', async ({ page }) => {
  // 1. В «Основных параметрах» строки «План, ч» нет, строка «Срочно» есть
  const window = await openCardByKey(page, 'UXB-3', 'План через плюс')
  await trackToasts(page)
  const main = window.getByRole('region', { name: 'Основные параметры' })
  await expect(main.locator('dt', { hasText: 'Срочно' })).toBeVisible()
  await expect(main.locator('dt', { hasText: 'План, ч' })).toHaveCount(0)

  // 2. «+» → «Основное» → «План, ч»: строка появилась, курсор в поле
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await expect(page.getByRole('menu').getByText('Основное', { exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'План, ч' }).click()
  const plan = main.getByRole('textbox', { name: 'План, ч' })
  await expect(main.locator('dt', { hasText: 'План, ч' })).toBeVisible()
  await expect(plan).toBeFocused()

  // 3. 3 и Enter — «Сохранено», в поле 3
  await expectNewToast(page, 'Сохранено', async () => {
    await plan.fill('3')
    await plan.press('Enter')
  })
  await expect(plan).toHaveValue('3')

  // 4. Стереть и Enter — «Сохранено», строки «План, ч» нет
  await expectNewToast(page, 'Сохранено', async () => {
    await plan.fill('')
    await plan.press('Enter')
  })
  await expect(main.locator('dt', { hasText: 'План, ч' })).toHaveCount(0)
})
