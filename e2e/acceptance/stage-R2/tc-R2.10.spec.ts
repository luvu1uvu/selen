import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { roleCell, userRow } from '../stage-3/helpers'
import { COMPANY_2, COMPANY_3, companySelect, openAdminPanel } from './helpers'

/**
 * ТК-R2.10: администратор нескольких компаний переключается между ними; чужой компании у него нет. irina@ → e2e-multi-
 * admin (администратор «E2E Компании 2» и «E2E Компании 3»). Люди «Компании 2»: Кирилл, Лариса, Максим → «E2E Сотрудник
 * второй», Олег (два «дома») → «E2E Два дома» и «E2E Два дома без входа»; «Компании 3»: Нина — в E2E-данных её нет
 * (там только администратор и Владелец). Роли второй компании не проверяем: ТК-R2.9 на время делает «E2E Сотрудника
 * второй» администратором.
 */
test.use({ storageState: authFile('e2e-multi-admin@selen.test') })

const SECOND = ['E2E Админ двух компаний', 'E2E Два дома', 'E2E Два дома без входа', 'E2E Сотрудник второй']

test('ТК-R2.10. Выбор компании в админке — только у того, у кого их несколько @tc-R2.10', async ({ page }) => {
  // 1. Администрирование: в выборе только две его компании, пункта «Компании» нет
  await page.goto('/')
  const panel = await openAdminPanel(page)
  const select = companySelect(page)
  await expect(select.locator('option')).toHaveText([COMPANY_2, COMPANY_3])
  await expect(panel.getByRole('link', { name: 'Компании', exact: true })).toHaveCount(0)

  // 2. Выбрать вторую компанию → «Пользователи»: её люди и Владелец с ролью «Владелец»
  await select.selectOption({ label: COMPANY_2 })
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(select.locator('option:checked')).toHaveText(COMPANY_2)
  for (const name of SECOND) await expect(userRow(page, name), name).toBeVisible()
  await expect(roleCell(page, 'E2E Владелец')).toHaveText('Владелец')
  const secondUrl = page.url()

  // 3. В выборе — третья компания: открылись её «Пользователи» — администратор и Владелец, людей второй нет
  await select.selectOption({ label: COMPANY_3 })
  await expect(page).not.toHaveURL(secondUrl)
  await expect(page).toHaveURL(/\/admin\/c\/[^/]+\/users$/)
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(userRow(page, 'E2E Админ двух компаний')).toBeVisible()
  await expect(roleCell(page, 'E2E Админ двух компаний')).toHaveText('Администратор')
  await expect(roleCell(page, 'E2E Владелец')).toHaveText('Владелец')
  for (const name of SECOND.slice(1)) await expect(userRow(page, name), name).toHaveCount(0)
})
