import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { chooseCompany, COMPANY_1, COMPANY_2, openAdminPanel, tree, treeCompany } from './helpers'

/**
 * ТК-R2.12: сотрудник двух компаний работает в обеих; администратор одной не может отключить его во второй. oleg@ →
 * в дереве — e2e-two-homes («дом» в «Компании 1» и «E2E Компании 2»: RHOME «Дом: первая компания» в корне первой,
 * папка «E2E Клиенты» с RSECOND «Вторая компания: продажи» во второй); в шагах 2–3 — «E2E Два дома без входа» (так же
 * два «дома», в систему не входит: деактивация завершает сессии и сбросила бы сохранённый вход e2e-two-homes).
 * admin@ → e2e-admin (администратор только «Компании 1»), owner@ → e2e-owner. Тест возвращает человека в «Активен».
 */

const IDLE = 'E2E Два дома без входа'

const status = (page: Page) => userRow(page, IDLE).getByRole('cell').nth(3)
const actions = (page: Page) => page.getByRole('button', { name: `Действия с пользователем «${IDLE}»` })

test('ТК-R2.12. Человек с двумя «домами»: обе компании в дереве, деактивирует только Владелец @tc-R2.12', async ({
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

  // 2. Администратор первой компании: в строке человека меню «⋯» нет; подсказка у значка — только Владелец
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await admin.goto('/admin/users')
  await expect(admin.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(userRow(admin, IDLE)).toBeVisible()
  await expect(actions(admin)).toHaveCount(0)
  await userRow(admin, IDLE).getByRole('link', { name: 'Доступ к пространствам' }).hover()
  await expect(admin.getByRole('tooltip')).toContainText(
    'Сотрудник работает в нескольких компаниях — деактивировать и активировать его может только Владелец',
  )

  // 3. Владелец: выбор «Компания 1» → «Пользователи» → «⋯» → «Деактивировать» → подтвердить; затем «Активировать»
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  const panel = await openAdminPanel(owner)
  await chooseCompany(owner, COMPANY_1)
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(status(owner)).toHaveText('Активен')

  await actions(owner).click()
  await owner.getByRole('menuitem', { name: 'Деактивировать' }).click()
  const confirm = owner.getByRole('dialog', { name: 'Деактивировать пользователя?' })
  await confirm.getByRole('button', { name: 'Деактивировать', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(status(owner)).toHaveText('Деактивирован')

  await actions(owner).click()
  await owner.getByRole('menuitem', { name: 'Активировать' }).click()
  await expect(status(owner)).toHaveText('Активен')
  // И после обновления страницы
  await owner.reload()
  await expect(status(owner)).toHaveText('Активен')
})
