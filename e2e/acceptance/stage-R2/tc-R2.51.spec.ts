import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { chips, chooseRoles, openCompanyUsers, usersTabs } from './helpers'

/**
 * ТК-R2.51: доступ группе выдаётся со страницы группы — и к папке, и с несколькими ролями. admin@ → e2e-admin;
 * «Подрядчики» → «E2E Подрядчики» (её доступ к «Эксплуатации» — RGROUPS «Права: группы», «Редактор — только свои
 * карточки», E2eSeeder::rights2), «Продуктовые команды» → «E2E Продуктовые команды» (E2eSeeder::foldersAccess). В конце
 * доступ к папке отзывается — тест можно повторить.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const GROUP = 'E2E Подрядчики'
const FOLDER = 'E2E Продуктовые команды'
const FOLDER_ROW = `Папка «${FOLDER}»`
const OWN = 'Редактор — только свои карточки'

/** Строка таблицы «Сущностей» — по названию папки или пространства. */
const entityRow = (page: Page, name: string) =>
  page.getByRole('region', { name: 'Сущности' }).getByRole('row').filter({ hasText: name })

const roles = (page: Page, name: string) => chips(entityRow(page, name).getByRole('cell').nth(1))

test('ТК-R2.51. «Сущности» группы: папки и пространства с ролями @tc-R2.51', async ({ page }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  // 1. «Пользователи» → «Группы» → группа → раздел «Сущности»
  await openCompanyUsers(page)
  await usersTabs(page).getByRole('link', { name: 'Группы' }).click()
  await page.getByRole('main').getByRole('link', { name: GROUP, exact: true }).click()
  await expect(page.getByRole('heading', { name: GROUP, level: 1 })).toBeVisible()
  const section = page.getByRole('region', { name: 'Сущности' })
  await expect(section.getByRole('heading', { name: 'Сущности' })).toBeVisible()
  await expect(roles(page, 'Права: группы (RGROUPS)')).toHaveText([OWN])

  // 2. «Папка или пространство» — папка; роли: вместо «Комментатора» — «Редактор — только свои карточки» → «Выдать доступ»
  await section.getByLabel('Папка или пространство', { exact: true }).selectOption({ label: FOLDER_ROW })
  const chooser = section.getByRole('group', { name: 'Роли', exact: true })
  await expect(chooser.getByRole('button', { pressed: true })).toHaveText(['Комментатор'])
  await chooseRoles(chooser, [OWN])
  await section.getByRole('button', { name: 'Выдать доступ', exact: true }).click()
  await expect(page.getByText('Доступ выдан').first()).toBeVisible()

  try {
    // В таблице — папка с чипом «Редактор — только свои карточки»; доступ к пространству — как был
    await expect(roles(page, FOLDER_ROW)).toHaveText([OWN])
    await expect(roles(page, 'Права: группы (RGROUPS)')).toHaveText([OWN])

    // 3. «Изменить роли в «…»» → отметить ещё «Комментатор» → «Сохранить»: в строке папки два чипа
    await section.getByRole('button', { name: `Изменить роли в «${FOLDER}»` }).click()
    const dialog = page.getByRole('dialog', { name: `Роли группы «${GROUP}» в «${FOLDER}»` })
    await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), ['Комментатор', OWN])
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog).toBeHidden()
    await expect(roles(page, FOLDER_ROW)).toHaveText(['Комментатор', OWN])

    // …и после обновления страницы
    await page.reload()
    await expect(page.getByRole('heading', { name: GROUP, level: 1 })).toBeVisible()
    await expect(roles(page, FOLDER_ROW)).toHaveText(['Комментатор', OWN])
    await expect(roles(page, 'Права: группы (RGROUPS)')).toHaveText([OWN])
  } finally {
    // Вернуть как было: доступ группы к папке отозван
    await section.getByRole('button', { name: `Отозвать доступ к ${FOLDER}` }).click()
    await page.getByRole('dialog', { name: 'Отозвать доступ группы?' }).getByRole('button', { name: 'Отозвать' }).click()
    await expect(entityRow(page, FOLDER_ROW)).toHaveCount(0)
  }
})
