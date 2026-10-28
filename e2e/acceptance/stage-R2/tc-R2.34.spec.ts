import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openAdminPanel } from './helpers'

/**
 * ТК-R2.34: в копии одной команды (ADR-0026) в фильтре журнала — только события, которые в ней бывают: без событий
 * компаний и гостей. owner@ → e2e-owner. Тег @single-company — второй прогон scripts/e2e.sh.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

/** Есть в любом режиме — в том числе события пользователей из тест-кейса. */
const COMMON_EVENTS = [
  'Все события',
  'Пользователь деактивирован',
  'Пользователь приглашён',
  'Учётная запись отключена Владельцем',
]

/** Только в копии с несколькими компаниями (MULTI_COMPANY_EVENT_TYPES). */
const MULTI_COMPANY_EVENTS = [
  'Компания создана',
  'Компания переименована',
  'Сотрудник добавлен в компанию',
  'Гость добавлен',
  'Доступ гостя изменён',
  'Гость убран',
]

test('ТК-R2.34. Журнал: в фильтре нет событий компаний и гостей @tc-R2.34 @single-company', async ({ page }) => {
  // 1. «Администрирование» → «Журнал событий»
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await panel.getByRole('link', { name: 'Журнал событий', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Журнал событий', level: 1 })).toBeVisible()

  // 2. «Тип события»: «Пользователь деактивирован», «Пользователь приглашён» и другие — есть; событий компаний и гостей нет
  const types = page.getByLabel('Тип события')
  for (const name of COMMON_EVENTS) {
    await expect(types.getByRole('option', { name, exact: true }), name).toHaveCount(1)
  }
  for (const name of MULTI_COMPANY_EVENTS) {
    await expect(types.getByRole('option', { name, exact: true }), name).toHaveCount(0)
  }
})
