import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import {
  COMPANY_1,
  COMPANY_2,
  expandClients,
  openCompanyUsers,
  SECOND_SPACE,
  spaceLink,
  tree,
  treeCompany,
  userActions,
} from './helpers'

/**
 * ТК-R2.19: «Деактивировать» убирает человека только из этой компании; войти он может, пока есть другая. oleg@ (два
 * «дома») → «E2E Убран из второй» (e2e-partly@: «дом» в «Компании 1» — редактор RHOME «Дом: первая компания» —
 * и в «E2E Компании 2» — редактор RSECOND «Вторая компания: продажи»); admin@ и «Компания 1» → e2e-multi-admin
 * и «E2E Компания 2» (компании наоборот: «Разработка» → RSECOND, «Продажи» и «Поддержка» → RHOME). В E2E-данных он уже
 * убран из второй компании (как после шага 1), поэтому шаги идут по кругу: шаг 2 (что он видит) → шаг 3 (вернуть) →
 * шаг 1 (убрать снова) — тест заканчивается в исходном состоянии и его можно повторить. Деактивация в одной из компаний
 * не завершает его сеанс — сохранённый вход e2e-partly работает весь тест.
 */

const PERSON = 'E2E Убран из второй'

const status = (page: Page) => userRow(page, PERSON).getByRole('cell').nth(3)

test('ТК-R2.19. Деактивация в компании: человек с двумя «домами» работает дальше в другой @tc-R2.19', async ({
  browser,
}) => {
  // Администратор второй компании: человек в ней деактивирован (E2E-данные — как после шага 1)
  const admin = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await openCompanyUsers(admin, COMPANY_2)
  await expect(status(admin)).toHaveText('Деактивирован')

  // 2. Он входит: в дереве — только первая компания, пространства второй нет
  const person = await pageAs(browser, 'e2e-partly@selen.test')
  await expect(spaceLink(person, 'Дом: первая компания')).toBeVisible()
  await expect(tree(person).getByRole('heading')).toHaveCount(0)
  await expect(tree(person).getByText(SECOND_SPACE)).toHaveCount(0)
  await expect(tree(person).getByText('E2E Клиенты')).toHaveCount(0)

  // 3. Администратор: «⋯» → «Активировать» — статус «Активен», у него снова пространство второй компании
  await userActions(admin, PERSON).click()
  await admin.getByRole('menuitem', { name: 'Активировать' }).click()
  await expect(status(admin)).toHaveText('Активен')
  await person.reload()
  await expect(tree(person).getByRole('heading')).toHaveText([COMPANY_1, COMPANY_2])
  const second = treeCompany(person, COMPANY_2)
  await expandClients(second)
  await expect(second.getByRole('link', { name: new RegExp(`${SECOND_SPACE}$`) })).toBeVisible()

  // 1. Администратор: «⋯» → «Деактивировать» → подтвердить — статус «Деактивирован»
  await userActions(admin, PERSON).click()
  await admin.getByRole('menuitem', { name: 'Деактивировать' }).click()
  const confirm = admin.getByRole('dialog', { name: 'Деактивировать в компании?' })
  await confirm.getByRole('button', { name: 'Деактивировать', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(status(admin)).toHaveText('Деактивирован')

  // 2. Он по-прежнему в системе: вход работает, в дереве снова только первая компания
  await person.reload()
  await expect(person.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await expect(spaceLink(person, 'Дом: первая компания')).toBeVisible()
  await expect(tree(person).getByRole('heading')).toHaveCount(0)
  await expect(tree(person).getByText(SECOND_SPACE)).toHaveCount(0)
})
