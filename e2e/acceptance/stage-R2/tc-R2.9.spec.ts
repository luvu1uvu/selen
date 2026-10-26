import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_1, COMPANY_2, COMPANY_3, companySelect, openAdminPanel, stamp } from './helpers'

/**
 * ТК-R2.9: компании создаёт и ведёт только Владелец; новая компания получает справочники из шаблона. owner@ →
 * e2e-owner; «Компания 2» и «Компания 3» → «E2E Компания 2» и «E2E Компания 3», их администратор Ирина → «E2E Админ
 * двух компаний», Кирилл (назначается администратором «Компании 2») → «E2E Сотрудник второй» (в систему не входит;
 * в конце теста администратором его снимаем — тест можно повторить). «Компания 4» / «Филиал Север» — с одноразовой
 * меткой: компании не удаляются, повторный прогон на том же стеке создаёт новую. Поэтому компаний «не меньше»,
 * а не ровно три/четыре.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const PERSON = 'E2E Сотрудник второй'
const MULTI_ADMIN = 'E2E Админ двух компаний'

/** Строка списка «Компании» — по точному названию (ссылка на её «Пользователей»). */
const companyRow = (page: Page, name: string) =>
  page.getByRole('main').getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })
/** Ячейки строки: Компания, Сотрудники, Администраторы, Действия. */
const people = (page: Page, name: string) => companyRow(page, name).getByRole('cell').nth(1)
const admins = (page: Page, name: string) => companyRow(page, name).getByRole('cell').nth(2)

/** «⋯» у компании → пункт меню. */
async function companyAction(page: Page, name: string, item: 'Переименовать' | 'Администраторы') {
  await page.getByRole('button', { name: `Действия с компанией «${name}»` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('ТК-R2.9. «Компании»: создать, переименовать, назначить администратора @tc-R2.9', async ({ page }) => {
  const id = stamp()
  const created = `Компания 4 ${id}`
  const renamed = `Филиал Север ${id}`

  // 1. Администрирование → «Компании»: три компании с администраторами
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await panel.getByRole('link', { name: 'Компании', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Компании', level: 1 })).toBeVisible()
  await expect(admins(page, COMPANY_1)).toContainText('E2E Администратор')
  await expect(admins(page, COMPANY_2)).toHaveText(MULTI_ADMIN)
  await expect(admins(page, COMPANY_3)).toHaveText(MULTI_ADMIN)

  // 2. «Создать компанию»: название → «Создать»
  await page.getByRole('button', { name: 'Создать компанию' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Новая компания' })
  await createDialog.getByLabel('Название').fill(created)
  await createDialog.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(createDialog).toBeHidden()
  await expect(companyRow(page, created)).toBeVisible()

  // 3. «⋯» → «Переименовать» → новое название → «Сохранить»: сотрудников 0, администраторов «Нет»
  await companyAction(page, created, 'Переименовать')
  const renameDialog = page.getByRole('dialog', { name: 'Переименовать компанию' })
  await renameDialog.getByLabel('Название').fill(renamed)
  await renameDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(renameDialog).toBeHidden()
  await expect(companyRow(page, renamed)).toBeVisible()
  await expect(companyRow(page, created)).toHaveCount(0)
  await expect(people(page, renamed)).toHaveText('0')
  await expect(admins(page, renamed)).toHaveText('Нет')

  // 4. «⋯» у второй компании → «Администраторы»: найти, выбрать, «Назначить», закрыть окно
  await companyAction(page, COMPANY_2, 'Администраторы')
  const adminsDialog = page.getByRole('dialog', { name: `Администраторы: ${COMPANY_2}` })
  await adminsDialog.getByLabel('Назначить из сотрудников компании').fill('E2E Сотрудник вт')
  await adminsDialog.getByRole('button', { name: new RegExp(`^${PERSON}`) }).click()
  await adminsDialog.getByRole('button', { name: 'Назначить', exact: true }).click()
  const list = adminsDialog.getByRole('list', { name: 'Администраторы компании' })
  await expect(list.getByRole('listitem').filter({ hasText: PERSON })).toBeVisible()
  await adminsDialog.getByRole('button', { name: 'Закрыть' }).first().click()
  await expect(adminsDialog).toBeHidden()
  // У второй компании — оба администратора
  await expect(admins(page, COMPANY_2)).toContainText(MULTI_ADMIN)
  await expect(admins(page, COMPANY_2)).toContainText(PERSON)

  // 5. Выбор компании над меню: все компании, в том числе новая → она → «Типы карточек» — справочник из шаблона
  const select = companySelect(page)
  for (const name of [COMPANY_1, COMPANY_2, COMPANY_3, renamed]) {
    await expect(select.locator('option', { hasText: name }), name).toHaveCount(1)
  }
  await select.selectOption({ label: renamed })
  await panel.getByRole('link', { name: 'Типы карточек', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Типы карточек', level: 1 })).toBeVisible()
  await expect(select.locator('option:checked')).toHaveText(renamed)
  const types = page.getByRole('main').getByRole('row')
  // Заголовок таблицы и четыре типа: «Задача» (по умолчанию), «Баг», «История», «Эпик»
  await expect(types).toHaveCount(5)
  await expect(types.nth(1)).toContainText('Задача')
  await expect(types.nth(1)).toContainText('По умолчанию')
  await expect(types.nth(2)).toContainText('Баг')
  await expect(types.nth(3)).toContainText('История')
  await expect(types.nth(4)).toContainText('Эпик')

  // Уборка: «E2E Сотрудник второй» — снова не администратор (тест можно повторить, данные других тестов прежние)
  await panel.getByRole('link', { name: 'Компании', exact: true }).click()
  await companyAction(page, COMPANY_2, 'Администраторы')
  await list.getByRole('listitem').filter({ hasText: PERSON }).getByRole('button', { name: 'Снять' }).click()
  await expect(list.getByRole('listitem').filter({ hasText: PERSON })).toHaveCount(0)
  await adminsDialog.getByRole('button', { name: 'Закрыть' }).first().click()
  await expect(admins(page, COMPANY_2)).toHaveText(MULTI_ADMIN)
})
