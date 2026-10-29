import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCardByKey } from '../stage-ux2/helpers'
import { chips, chooseRoles, COMPANY_KEY, COMPANY_SPACE } from './helpers'

/**
 * ТК-R2.7: поиск людей и групп для выдачи доступа и список типов карточек — по компании пространства; в одной компании
 * выбор прежний. anna@ (администратор «Разработки») → e2e-admin (администратор RCOMP «Права: компания»), «Дина» →
 * «E2E Сотрудник компании» (в систему не входит), карточка доски «Продукт» → RCOMP-1 «Сменить тип»; группы E2eSeeder:
 * активные «E2E Аналитики», «E2E Руководители», «E2E Подрядчики», архивная «E2E Стажёры» (E2eSeeder::companies,
 * rights2). Пространство открывается по адресу: ТК-R2.6 переносит его в папку и возвращает.
 *
 * П2d-1: роль в окне «Добавить участника» — чипами (вместо списка «Роль»); в «Участниках» личные роли — чипы в столбце
 * «Личные роли» и кнопка «Изменить роли …» (вместо списка «Роль …» в строке).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const PERSON = 'E2E Сотрудник компании'

const row = (page: Page) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Изменить роли ${PERSON}` }) })
const personalRoles = (page: Page) => chips(row(page).getByRole('cell').nth(1))

/** Пространство → вкладка «Участники» (по умолчанию — «Люди»). */
async function openMembers(page: Page) {
  await page.goto(`/spaces/${COMPANY_KEY}`)
  await expect(page.getByRole('heading', { name: COMPANY_SPACE }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Участники', exact: true }).click()
  // Список загружен: строка единственного личного администратора
  await expect(page.getByRole('button', { name: 'Изменить роли E2E Администратор' })).toBeVisible()
}

test('ТК-R2.7. Выдача доступа в пространстве и тип карточки — как раньше @tc-R2.7', async ({ page }) => {
  // 1. «Участники» → «Добавить участника»: поиск, выбрать, роль «Комментатор», добавить
  await openMembers(page)
  // Повтор теста после сбоя: человек мог остаться участником
  const remove = page.getByRole('button', { name: `Исключить ${PERSON}` })
  if ((await remove.count()) > 0) {
    await remove.click()
    const confirm = page.getByRole('dialog', { name: 'Исключить из пространства?' })
    await confirm.getByRole('button', { name: 'Исключить' }).click()
    await expect(remove).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Добавить участника' }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить участника' })
  await dialog.getByRole('textbox', { name: 'Сотрудник' }).fill('E2E Сотрудник комп')
  await dialog.getByRole('button', { name: new RegExp(`^${PERSON}`) }).click()
  await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), ['Комментатор'])
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByText('Участник добавлен')).toBeVisible()
  await expect(dialog).toBeHidden()

  // Человек — в «Участниках» с ролью «Комментатор» (и после обновления страницы)
  await expect(personalRoles(page)).toHaveText(['Комментатор'])
  await openMembers(page)
  await expect(personalRoles(page)).toHaveText(['Комментатор'])
  await expect(row(page)).toContainText('Лично: Комментатор')

  // 2. «Группы» → «Добавить группу»: «Все сотрудники» первой, активные группы есть, архивной нет
  await page.getByRole('tab', { name: 'Группы', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить группу' }).click()
  const groupDialog = page.getByRole('dialog', { name: 'Добавить группу' })
  const options = groupDialog.getByLabel('Группа', { exact: true }).locator('option')
  // Первый пункт — подсказка «Выберите группу…», за ним группы
  await expect(options.nth(1)).toHaveText(/^Все сотрудники/)
  const groups = await options.allInnerTexts()
  for (const name of ['E2E Аналитики', 'E2E Руководители', 'E2E Подрядчики']) {
    expect(groups.some((text) => text.startsWith(`${name} `)), name).toBe(true)
  }
  expect(groups.filter((text) => text.startsWith('E2E Стажёры'))).toEqual([])
  await groupDialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(groupDialog).toBeHidden()

  // 3. Карточка доски «Продукт»: тип → «Баг», закрыть, открыть снова
  const window = await openCardByKey(page, `${COMPANY_KEY}-1`, 'Сменить тип')
  await window.getByRole('button', { name: /— тип карточки$/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Баг$/ }).click()
  await expect(page.getByText('Сохранено')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Баг — тип карточки' })).toBeVisible()
  await window.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Тип — «Баг» и после повторного открытия (с доски) и после обновления страницы
  await page.getByRole('button', { name: new RegExp(`^Открыть ${COMPANY_KEY}-1: `) }).click()
  const reopened = page.getByRole('dialog', { name: 'Сменить тип' })
  await expect(reopened.getByRole('button', { name: 'Баг — тип карточки' })).toBeVisible()
  await page.reload()
  const afterReload = page.getByRole('dialog', { name: 'Сменить тип' })
  await expect(afterReload.getByRole('button', { name: 'Баг — тип карточки' })).toBeVisible()
})
