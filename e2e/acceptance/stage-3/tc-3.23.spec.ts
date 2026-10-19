import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { roleCell } from './helpers'

test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-3.23. Бейдж «Владелец» в админке и в профиле @tc-3.23', async ({ page }) => {
  await openHome(page)

  // 1. Меню пользователя → «Профиль»: бейдж рядом с заголовком
  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Профиль' }).click()
  const profileHeading = page.getByRole('heading', { level: 1 })
  await expect(profileHeading).toContainText('Профиль')
  await expect(profileHeading.getByText('Владелец', { exact: true })).toBeVisible()

  // 2. «Администрирование» → «Пользователи»: колонка «Роль»
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('link', { name: 'Пользователи' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(roleCell(page, 'E2E Владелец')).toHaveText('Владелец')
  await expect(roleCell(page, 'E2E Администратор')).toHaveText('Администратор')

  // 3. Страница пользователя: бейдж рядом с именем
  await page.getByRole('link', { name: 'E2E Владелец', exact: true }).click()
  const userHeading = page.getByRole('heading', { level: 1 })
  await expect(userHeading).toContainText('E2E Владелец')
  await expect(userHeading.getByText('Владелец', { exact: true })).toBeVisible()
})
