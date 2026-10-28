import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { companyButton, openAdminPanel } from './helpers'

/**
 * ТК-R2.29: в копии одной команды (ADR-0026, SELEN_MULTI_COMPANY=false) экрана «Компании» нет. owner@ → e2e-owner.
 * Тег @single-company — второй прогон scripts/e2e.sh, php пересоздан в режиме «одна компания»; данные E2eSeeder — те
 * же, в базе три компании. Поэтому у Владельца в E2E есть выбор компании (ADR-0026, «Если компаний в базе несколько») —
 * «нет выбора компании» скрипт проверяет у e2e-admin (у него компания одна), у Владельца — только вручную.
 */

test('ТК-R2.29. Владелец: «Компаний» нет @tc-R2.29 @single-company', async ({ browser }) => {
  // 1–2. Владелец: «Администрирование» — пункта «Компании» нет, пункты начинаются с «Пользователи»
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  const panel = await openAdminPanel(owner)
  await expect(panel.getByRole('link', { name: 'Пользователи', exact: true })).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Компании', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('link').first()).toHaveText('Пользователи')

  // 3. /admin/companies — «Страница не найдена»
  await owner.goto('/admin/companies')
  await expect(owner.getByRole('heading', { name: 'Страница не найдена', level: 1 })).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Компании', level: 1 })).toHaveCount(0)
  await expect(owner.getByRole('button', { name: 'Создать компанию' })).toHaveCount(0)

  // Выбора «Компания» над меню нет — у администратора одной компании
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  const adminPanel = await openAdminPanel(admin)
  await expect(adminPanel.getByRole('link').first()).toHaveText('Пользователи')
  await expect(companyButton(admin)).toHaveCount(0)
  await expect(adminPanel.getByRole('link', { name: 'Компании', exact: true })).toHaveCount(0)
})
