import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectNewToast, param, trackToasts } from '../stage-ui1/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.8 (U-13): «Снять ответственного» — первый пункт списка, над людьми; после выбора — «Сохранено»,
 * ответственного нет («Назначить»). Анна → e2e-editor, DEV-41 (ответственный Борис Петров) → UXB-2 «Снять
 * ответственного», ответственный — «E2E Администратор» (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.8. «Снять ответственного» — первым в списке @tc-L98.8', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-2', 'Снять ответственного')
  await trackToasts(page)
  const main = window.getByRole('region', { name: 'Основные параметры' })

  // 1. «Ответственный» → щёлкнуть «E2E Администратор»
  await main.getByRole('button', { name: 'E2E Администратор — ответственный' }).click()
  const options = page.getByRole('option')
  // Список людей загружается при открытии («Загрузка…») — ждём людей
  await expect(options.filter({ hasText: 'E2E Редактор' })).toBeVisible()
  const names = await options.allTextContents()
  expect(names[0], 'первый пункт').toBe('Снять ответственного')
  expect(names.slice(1).some((name) => name.includes('E2E Редактор')), 'ниже — люди').toBe(true)

  // 2. «Снять ответственного» — «Сохранено», ответственного нет
  await expectNewToast(page, 'Сохранено', () => options.first().click())
  await expect(param(main, 'Ответственный')).toHaveText('Назначить')
})
