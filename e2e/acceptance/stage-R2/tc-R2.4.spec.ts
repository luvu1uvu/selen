import { expect, test, type Page } from '@playwright/test'
import { openHome, pageAs } from '../../tests/helpers'
import { findUser, openUsers, userRow } from '../stage-3/helpers'
import { expectHint } from '../stage-ux1/helpers'
import { accessRow, ALL, INTERNS, openMembers, result, sources, spaceLink, tree } from './helpers'

/**
 * ТК-R2.4: группы и «Все сотрудники» дают доступ как раньше, сводка «Доступ к пространствам» показывает, откуда
 * у человека доступ. admin@selen.test — e2e-admin; Григорий — «E2E Руководитель» (лично редактор RROLES, группа
 * «E2E Руководители» — комментатор в RROLES и RGROUPS); Жанна — e2e-restricted (лично «Редактор — только свои» в RROLES,
 * группа «E2E Подрядчики» — то же в RGROUPS); Демо Участник — e2e-outsider (в архивной группе «E2E Стажёры» с доступом
 * к RINTERN «Права: стажёры»). «Компания», открытая всем сотрудникам, — RALL «Права: для всех»: доступ «Всем
 * сотрудникам» тест выдаёт на время и в конце отзывает (иначе пространство увидели бы e2e-outsider и e2e-analyst
 * в других тестах). E2eSeeder::rights2. Человека в «Пользователях» тест находит полем «Поиск по имени или email» (П2c-2):
 * в списке 25 человек на странице, «E2E Руководитель» — ближе к концу алфавита.
 */

/** Администрирование → Пользователи → человек: страница «Доступ к пространствам». */
async function openAccess(page: Page, name: string) {
  await openUsers(page)
  await findUser(page, name)
  await userRow(page, name).getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Доступ к пространствам' })).toBeVisible()
}

/** Пространство → «Участники» → «Группы»: выдать доступ «Всем сотрудникам» (комментатор) или отозвать его. */
async function openSpaceGroups(page: Page) {
  await openHome(page)
  await openMembers(page, ALL)
  await page.getByRole('tab', { name: 'Группы', exact: true }).click()
}

async function grantEveryone(page: Page) {
  await openSpaceGroups(page)
  await page.getByRole('button', { name: 'Добавить группу' }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить группу' })
  const everyone = await dialog.locator('option', { hasText: 'Все сотрудники' }).getAttribute('value')
  await dialog.getByLabel('Группа').selectOption(everyone!)
  await dialog.getByLabel('Роль').selectOption({ label: 'Комментатор' })
  await dialog.getByRole('button', { name: 'Выдать доступ' }).click()
  await expect(page.getByText('Группе выдан доступ')).toBeVisible()
}

async function revokeEveryone(page: Page) {
  await openSpaceGroups(page)
  const remove = page.getByRole('button', { name: 'Убрать группу Все сотрудники' })
  // Дождаться списка групп: выдача есть — кнопка «Убрать», нет — «Группам доступ не выдан»
  await expect(remove.or(page.getByText('Группам доступ не выдан'))).toBeVisible()
  if ((await remove.count()) === 0) return
  await remove.click()
  await page.getByRole('dialog', { name: 'Отозвать доступ группы?' }).getByRole('button', { name: 'Убрать' }).click()
  await expect(page.getByText('Доступ группы отозван')).toBeVisible()
}

test('ТК-R2.4. Доступ через группы и «Все сотрудники», сводка «Доступ» в админке @tc-R2.4', async ({ browser }) => {
  const admin = await pageAs(browser, 'e2e-admin@selen.test')

  // 1. Григорий: «Разработка» — лично «Редактор» и группа «Руководители» — «Комментатор»;
  //    «Эксплуатация» — через «Руководители», «Комментатор»
  await openAccess(admin, 'E2E Руководитель')
  const leadRoles = accessRow(admin, 'RROLES')
  await expect(result(leadRoles)).toContainText('Редактор')
  await expect(result(leadRoles)).toContainText('Видит все карточки')
  await expect(sources(leadRoles)).toContainText('Лично: Редактор')
  await expect(sources(leadRoles)).toContainText('Группа «E2E Руководители»: Комментатор')
  const leadGroups = accessRow(admin, 'RGROUPS')
  await expect(result(leadGroups)).toContainText('Комментатор')
  await expect(sources(leadGroups)).toHaveText('Группа «E2E Руководители»: Комментатор')

  // 2. Жанна: «Разработка» — лично «Редактор», только свои карточки; «Эксплуатация» — группа «Подрядчики»,
  //    «Редактор», только свои карточки
  await openAccess(admin, 'E2E Подрядчик')
  const ownRoles = accessRow(admin, 'RROLES')
  await expect(result(ownRoles)).toContainText('Редактор')
  await expect(result(ownRoles)).toContainText('Только свои карточки')
  await expect(sources(ownRoles)).toHaveText('Лично: Редактор · Только свои карточки')
  const ownGroups = accessRow(admin, 'RGROUPS')
  await expect(result(ownGroups)).toContainText('Редактор')
  await expect(result(ownGroups)).toContainText('Только свои карточки')
  await expect(sources(ownGroups)).toHaveText('Группа «E2E Подрядчики»: Редактор · Только свои карточки')

  // 3. Сотрудник: в дереве есть пространство, открытое всем сотрудникам; пространства архивной группы нет
  try {
    await grantEveryone(admin)
    const member = await pageAs(browser, 'e2e-outsider@selen.test')
    await expect(spaceLink(member, ALL)).toBeVisible()
    // Пометка «доступно всем» — значок рядом со ссылкой, подсказка (Tooltip) по наведению: пачка UX-2 (LATER-88)
    // вынесла его из ссылки, поэтому проверяется видимая подсказка, а не текст ссылки (CLAUDE.md, frontend, правило 8)
    // Внутренний локатор filter({ has }) ищется внутри строки списка — от страницы, а не от дерева
    const mark = tree(member)
      .getByRole('listitem')
      .filter({ has: member.getByRole('link', { name: new RegExp(`(^|\\s)${ALL}$`) }) })
      .getByRole('img', { name: 'Доступно всем сотрудникам' })
    await expect(mark).toBeVisible()
    await mark.hover()
    await expectHint(member, 'Доступно всем сотрудникам')
    await expect(spaceLink(member, INTERNS)).toHaveCount(0)
    await expect(member.getByText(INTERNS)).toHaveCount(0)
  } finally {
    await revokeEveryone(admin)
  }
  // Уборка: без выдачи «Всем сотрудникам» у e2e-outsider снова нет ни одного пространства (no-access.spec)
  const after = await pageAs(browser, 'e2e-outsider@selen.test')
  await expect(after.getByText('У вас пока нет доступа ни к одному пространству')).toBeVisible()
})
