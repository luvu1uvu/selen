import { expect, test, type Page } from '@playwright/test'
import { openHome, pageAs } from '../../tests/helpers'
import { chooseRoles, GUEST_SPACE, openMembers } from './helpers'

/**
 * ТК-R2.28: гость не узнаёт лишнего о компании-хозяине — людей видит только по имени, группы — без названий (решение PM
 * 28.10 по аудиту П2c-1). boris@ (гость «Компании 2» в «Поддержке») → «E2E Гость» (e2e-guest@, гость «Компании 1»
 * в RGUEST «Гостевое», «Комментатор»); «Поддержку видят „Все сотрудники“ „Компании 2“» → доступ «Всех сотрудников»
 * «Компании 1» к RGUEST («Комментатор») тест выдаёт на время от имени e2e-admin и в конце отзывает: постоянная выдача
 * открыла бы RGUEST всем сотрудникам — e2e-analyst и e2e-outsider (groups.spec, no-access.spec) ждут, что у них нет ни
 * одного пространства; своя группа вместо встроенной не показала бы пометку «Все сотрудники». Лариса, Ирина → e2e-admin
 * (лично администратор RGUEST и сотрудник «Компании 1»). Регрессионный тест бага LATER-139: во вкладке «Группы» гостю
 * видна пометка «Все сотрудники» встроенной группы (и численность группы) — падает до исправления.
 *
 * П2d-1: роль в окне «Добавить группу» — чипами (вместо списка «Роль»).
 */

/** «Гостевое» → «Участники» → «Группы». */
async function openGroupsTab(page: Page) {
  await openMembers(page, GUEST_SPACE)
  await page.getByRole('tab', { name: 'Группы', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Группы', exact: true })).toHaveAttribute('aria-selected', 'true')
}

async function grantEveryone(admin: Page) {
  await openHome(admin)
  await openGroupsTab(admin)
  await admin.getByRole('button', { name: 'Добавить группу' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Добавить группу' })
  const everyone = await dialog.locator('option', { hasText: 'Все сотрудники' }).getAttribute('value')
  await dialog.getByLabel('Группа').selectOption(everyone!)
  await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), ['Комментатор'])
  await dialog.getByRole('button', { name: 'Выдать доступ' }).click()
  await expect(admin.getByText('Группе выдан доступ')).toBeVisible()
}

async function revokeEveryone(admin: Page) {
  await openHome(admin)
  await openGroupsTab(admin)
  const remove = admin.getByRole('button', { name: 'Убрать группу Все сотрудники' })
  await expect(remove.or(admin.getByText('Группам доступ не выдан'))).toBeVisible()
  if ((await remove.count()) === 0) return
  await remove.click()
  await admin.getByRole('dialog', { name: 'Отозвать доступ группы?' }).getByRole('button', { name: 'Убрать' }).click()
  await expect(admin.getByText('Доступ группы отозван')).toBeVisible()
}

test('ТК-R2.28. Гость видит людей компании-хозяина без email, группы — без названий @tc-R2.28', async ({ browser }) => {
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await grantEveryone(admin)
  try {
    // 1. Гость: «Гостевое» → «Участники» → «Люди»: люди компании — только по имени, свой email виден
    const guest = await pageAs(browser, 'e2e-guest@selen.test')
    await openMembers(guest, GUEST_SPACE)
    const main = guest.getByRole('main')
    const own = guest.getByRole('row').filter({ has: guest.getByText('вы', { exact: true }) })
    await expect(own).toContainText('e2e-guest@selen.test')
    const host = guest.getByRole('row').filter({ hasText: 'E2E Администратор' })
    await expect(host).toBeVisible()
    await expect(host).toContainText('Лично: Администратор')
    // Вместо названия группы — «группа: Комментатор»
    await expect(host).toContainText('группа: Комментатор')
    // Ни одного чужого email и ни одного названия группы компании-хозяина
    await expect(main).not.toContainText('e2e-admin@selen.test')
    await expect(main).not.toContainText('e2e-editor@selen.test')
    await expect(main).not.toContainText('Все сотрудники')
    expect((await main.innerText()).match(/[\w.-]+@selen\.test/g) ?? []).toEqual(['e2e-guest@selen.test'])

    // 2. Вкладка «Группы»: вместо «Все сотрудники» — «группа», описания нет
    await guest.getByRole('tab', { name: 'Группы', exact: true }).click()
    const row = guest.getByRole('main').getByRole('row').nth(1)
    await expect(row).toContainText('группа')
    await expect(row).toContainText('Комментатор')
    await expect(guest.getByRole('main')).not.toContainText('Все сотрудники')
    await expect(guest.getByRole('main')).not.toContainText('Встроенная группа')
  } finally {
    // Вернуть как было: «Все сотрудники» без доступа к RGUEST
    await revokeEveryone(admin)
  }
})
