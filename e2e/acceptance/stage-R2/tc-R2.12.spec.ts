import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { COMPANY_1, COMPANY_2, openCompanyUsers, tree, treeCompany, userActions } from './helpers'

/**
 * ТК-R2.12: сотрудник двух компаний работает в обеих; администратор одной убирает его только из своей компании,
 * учётную запись целиком отключает только Владелец (решение PM 28.10, п. 2; в П2b-2 его деактивировал только
 * Владелец — тест обновлён в П2c-1). oleg@ → в дереве — e2e-two-homes («дом» в «Компании 1» и «E2E Компании 2»: RHOME
 * «Дом: первая компания» в корне первой, папка «E2E Клиенты» с RSECOND «Вторая компания: продажи» во второй); в шагах
 * 2–3 — «E2E Два дома без входа» (так же два «дома», в систему не входит). admin@ → e2e-admin (администратор только
 * «Компании 1»), администратор второй компании — e2e-multi-admin, owner@ → e2e-owner. Тест возвращает человека
 * в «Активен» и ничего не отключает — его можно повторить.
 */

const IDLE = 'E2E Два дома без входа'

const status = (page: Page) => userRow(page, IDLE).getByRole('cell').nth(3)

test('ТК-R2.12. Человек с двумя «домами»: обе компании в дереве, администратор убирает его только из своей @tc-R2.12', async ({
  browser,
}) => {
  // 1. Сотрудник двух компаний: сверху заголовок первой компании, ниже — второй, у каждой — её узлы
  const twoHomes = await pageAs(browser, 'e2e-two-homes@selen.test')
  const first = treeCompany(twoHomes, COMPANY_1)
  const second = treeCompany(twoHomes, COMPANY_2)
  await expect(first.getByRole('heading', { name: COMPANY_1 })).toBeVisible()
  await expect(second.getByRole('heading', { name: COMPANY_2 })).toBeVisible()
  await expect(tree(twoHomes).getByRole('heading')).toHaveText([COMPANY_1, COMPANY_2])
  await expect(first.getByRole('link', { name: /Дом: первая компания$/ })).toBeVisible()
  await expect(first.getByText('E2E Клиенты')).toHaveCount(0)
  const folder = second.getByRole('button').filter({ has: twoHomes.getByText('E2E Клиенты', { exact: true }) })
  await expect(folder).toBeVisible()
  if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click()
  await expect(second.getByRole('link', { name: /Вторая компания: продажи$/ })).toBeVisible()
  await expect(second.getByText('Дом: первая компания')).toHaveCount(0)

  // 2. Администратор первой компании: «Деактивировать» есть, «Отключить учётную запись» — нет (это право Владельца)
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  await expect(status(admin)).toHaveText('Активен')
  await userActions(admin, IDLE).click()
  await expect(admin.getByRole('menuitem', { name: 'Деактивировать' })).toBeVisible()
  await expect(admin.getByRole('menuitem', { name: /^Отключить учётную запись/ })).toHaveCount(0)

  // «Деактивировать» → «Деактивировать в компании?» → подтвердить: в первой компании — «Деактивирован»
  await admin.getByRole('menuitem', { name: 'Деактивировать' }).click()
  const confirm = admin.getByRole('dialog', { name: 'Деактивировать в компании?' })
  await confirm.getByRole('button', { name: 'Деактивировать', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(status(admin)).toHaveText('Деактивирован')

  // Во второй компании он по-прежнему работает — её администратор видит «Активен»
  const secondAdmin = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await openCompanyUsers(secondAdmin, COMPANY_2)
  await expect(status(secondAdmin)).toHaveText('Активен')

  // Администратор первой компании возвращает его: «⋯» → «Активировать»
  await userActions(admin, IDLE).click()
  await admin.getByRole('menuitem', { name: 'Активировать' }).click()
  await expect(status(admin)).toHaveText('Активен')
  await admin.reload()
  await expect(status(admin)).toHaveText('Активен')

  // 3. Владелец: в меню человека есть и «Деактивировать» (из компании), и «Отключить учётную запись…» (целиком)
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_1)
  await userActions(owner, IDLE).click()
  await expect(owner.getByRole('menuitem', { name: 'Деактивировать' })).toBeVisible()
  await expect(owner.getByRole('menuitem', { name: 'Отключить учётную запись…' })).toBeVisible()
  await owner.keyboard.press('Escape')
  await expect(owner.getByRole('menu')).toHaveCount(0)
})
