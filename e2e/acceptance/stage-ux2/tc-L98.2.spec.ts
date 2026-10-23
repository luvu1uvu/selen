import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.2 (V-5): у читателя «Срочно» — текстом «Да» / «Нет», без недоступного флажка. Вера (комментатор
 * в «Разработке») → e2e-editor, комментатор в MOB «Мобильные приложения»; DEV-41 → MOB-1 (не срочная, E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.2. «Срочно» у читателя — «Да» / «Нет» @tc-L98.2', async ({ page }) => {
  // 1. Открыть карточку
  const window = await openCardByKey(page, 'MOB-1', 'Релиз мобильного приложения')
  const main = window.getByRole('region', { name: 'Основные параметры' })

  // «Срочно» — «Нет» текстом, флажка нет
  await expect(main.locator('dt', { hasText: 'Срочно' })).toBeVisible()
  await expect(param(main, 'Срочно')).toHaveText('Нет')
  await expect(main.getByRole('checkbox')).toHaveCount(0)
  await expect(param(main, 'Срочно').locator('input, button, [role="checkbox"]')).toHaveCount(0)
})
