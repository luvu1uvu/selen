import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { accessRow, openCompanyUsers, result, sources, userActions } from './helpers'

/**
 * ТК-R2.20: при уходе сотрудника его доступ одним действием получает преемник. admin@ → e2e-admin (администратор
 * «Компании 1»); grigory@ → «E2E Уходящий» (лично «Редактор» RLEAVE «Передача: работа», группа «E2E Группа уходящего»);
 * egor@ → «E2E Преемник» (лично «Администратор» RKEEP «Передача: дежурства», куда группа уходящего даёт «Комментатора»);
 * «Разработка» → RLEAVE, «Эксплуатация» → RKEEP, «Руководители» → «E2E Группа уходящего» (E2eSeeder::
 * guestsAndRightsCases). Оба в систему не входят. Передача — копирование (решение PM 28.10, п. 5): у вернувшегося
 * уходящего доступ на месте; повторный прогон даёт тот же результат.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const LEAVER = 'E2E Уходящий'
const SUCCESSOR = 'E2E Преемник'
const GROUP = 'E2E Группа уходящего'

const status = (page: Page) => userRow(page, LEAVER).getByRole('cell').nth(3)

test('ТК-R2.20. Деактивация с передачей доступа @tc-R2.20', async ({ page }) => {
  // 1–2. «Пользователи» → «⋯» у уходящего → «Деактивировать»: преемник — «E2E Преемник» → «Деактивировать»
  await openCompanyUsers(page)
  const usersUrl = page.url()
  await userActions(page, LEAVER).click()
  await page.getByRole('menuitem', { name: 'Деактивировать' }).click()
  const dialog = page.getByRole('dialog', { name: 'Деактивировать в компании?' })
  await dialog.getByLabel('Передать доступ сотруднику').fill('E2E Преем')
  await dialog.getByRole('button', { name: new RegExp(`^${SUCCESSOR}`) }).click()
  await expect(dialog.getByText(SUCCESSOR, { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Деактивировать', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Пользователь деактивирован, доступ передан: ${SUCCESSOR}`)).toBeVisible()
  await expect(status(page)).toHaveText('Деактивирован')

  // 3. «Пользователи» → преемник (ссылка на имени): его группы и «Доступ к пространствам»
  await userRow(page, SUCCESSOR).getByRole('link', { name: SUCCESSOR, exact: true }).click()
  await expect(page.getByRole('heading', { name: SUCCESSOR })).toBeVisible()
  await expect(page.getByRole('link', { name: GROUP, exact: true })).toBeVisible()
  // «Разработка» — лично «Редактор» (от уходящего)
  await expect(result(accessRow(page, 'RLEAVE'))).toContainText('Редактор')
  await expect(sources(accessRow(page, 'RLEAVE'))).toContainText('Лично: Редактор')
  // «Эксплуатация» — по-прежнему «Администратор»; группа уходящего добавила «Комментатора», роль не понизилась
  await expect(result(accessRow(page, 'RKEEP'))).toContainText('Администратор')
  await expect(sources(accessRow(page, 'RKEEP'))).toContainText('Лично: Администратор')
  await expect(sources(accessRow(page, 'RKEEP'))).toContainText(`Группа «${GROUP}»: Комментатор`)

  // 4. Вернуть уходящего: «⋯» → «Активировать» — «Активен», его доступ на месте
  await page.goto(usersUrl)
  await userActions(page, LEAVER).click()
  await page.getByRole('menuitem', { name: 'Активировать' }).click()
  await expect(status(page)).toHaveText('Активен')
  await userRow(page, LEAVER).getByRole('link', { name: LEAVER, exact: true }).click()
  await expect(page.getByRole('heading', { name: LEAVER })).toBeVisible()
  await expect(page.getByRole('link', { name: GROUP, exact: true })).toBeVisible()
  await expect(result(accessRow(page, 'RLEAVE'))).toContainText('Редактор')
  await expect(sources(accessRow(page, 'RLEAVE'))).toContainText('Лично: Редактор')
})
