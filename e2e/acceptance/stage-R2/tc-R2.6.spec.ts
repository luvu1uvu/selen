import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { structureRow } from '../stage-3/helpers'
import { openCardByKey } from '../stage-ux2/helpers'
import { COMPANY_SPACE, stamp, tree } from './helpers'

/**
 * ТК-R2.6: группы, справочники и дерево принадлежат «Компании 1» — администратор работает с ними как прежде.
 * admin@ → e2e-admin; «Борис Петров» → «E2E Сотрудник группы» (в систему не входит), «Маркетинг» и «Компания» → RCOMP
 * «Права: компания» (E2eSeeder::companies). Выбор меток и типов карточки — в RCOMP-1 «Сменить тип» и в QA-1 другого
 * пространства («любого пространства»), ничего не меняя. Названия группы, метки, типа и папки — одноразовые (тест можно
 * повторить); в конце RCOMP возвращается в корень дерева, чтобы другие тесты находили его там, где он был.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const PERSON = 'E2E Сотрудник группы'

/** Пункт «Администрирование» → раздел (заголовок страницы — как у пункта, кроме «Метки компании»). */
async function openAdmin(page: Page, path: string, heading: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

/** «Структура»: «⋯» пространства → «Переместить в…» → куда. */
async function moveSpace(page: Page, target: string) {
  await page.getByRole('button', { name: `Действия с «${COMPANY_SPACE}»` }).click()
  await page.getByRole('menuitem', { name: 'Переместить в…' }).click()
  const dialog = page.getByRole('dialog', { name: `Переместить «${COMPANY_SPACE}»` })
  await dialog.getByLabel('Куда').selectOption({ label: target })
  await dialog.getByRole('button', { name: 'Переместить' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Перемещено').first()).toBeVisible()
}

/** В окне карточки: в выборе меток есть метка, в выборе типа — тип; оба списка закрываются без изменений. */
async function expectChoices(page: Page, window: Locator, label: string, type: string) {
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Метки' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: label })).toBeVisible()
  await expect(page.getByRole('menuitemcheckbox', { name: label })).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  await window.getByRole('button', { name: /— тип карточки$/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: new RegExp(`${type}$`) })).toBeVisible()
  await expect(page.getByRole('menuitemcheckbox', { name: new RegExp(`${type}$`) })).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(window).toBeVisible()
}

test('ТК-R2.6. Группы, метки, типы карточек и «Структура» — как раньше @tc-R2.6', async ({ page }) => {
  const id = stamp()
  const group = `Проверка ТК-R2.6 ${id}`
  const label = `ТК-R2.6 ${id}`
  const type = `Улучшение ${id}`
  const folder = `ТК-R2.6 ${id}`

  // 1. Группы → создать группу (открывается её страница), добавить человека
  await openAdmin(page, '/admin/groups', 'Группы')
  await page.getByRole('button', { name: 'Создать группу' }).click()
  const groupDialog = page.getByRole('dialog', { name: 'Новая группа' })
  await groupDialog.getByLabel('Название').fill(group)
  await groupDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('heading', { name: group, level: 1 })).toBeVisible()
  await page.getByLabel('Добавить в группу').fill('E2E Сотрудник гр')
  await page.getByRole('button', { name: /E2E Сотрудник группы e2e-company-group/ }).click()
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByText(`${PERSON} добавлен(а) в группу`)).toBeVisible()

  // 2. В этой группе — доступ к пространству с ролью «Комментатор»
  await page.getByLabel('Пространство', { exact: true }).selectOption({ label: `${COMPANY_SPACE} (RCOMP)` })
  await page.getByLabel('Роль', { exact: true }).selectOption({ label: 'Комментатор' })
  await page.getByRole('button', { name: 'Выдать доступ' }).click()
  await expect(page.getByText('Доступ выдан')).toBeVisible()

  // Человек — в составе группы, у группы — доступ с ролью «Комментатор» (и после обновления страницы)
  await page.reload()
  await expect(page.getByRole('heading', { name: group, level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: `Исключить ${PERSON} из группы` })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: PERSON })).toBeVisible()
  const grantRole = page.getByLabel(`Роль группы в ${COMPANY_SPACE}`)
  await expect(grantRole.locator('option:checked')).toHaveText('Комментатор')

  // 3. Метки компании: создать общую метку — она в списке меток
  await openAdmin(page, '/admin/labels', 'Метки компании')
  await page.getByRole('button', { name: 'Добавить метку' }).click()
  const labelDialog = page.getByRole('dialog', { name: 'Новая метка' })
  await labelDialog.getByLabel('Название').fill(label)
  await labelDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(labelDialog).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: label })).toBeVisible()

  // 4. Типы карточек: создать тип — он в списке типов
  await openAdmin(page, '/admin/card-types', 'Типы карточек')
  await page.getByRole('button', { name: 'Добавить тип' }).click()
  const typeDialog = page.getByRole('dialog', { name: 'Новый тип карточки' })
  await typeDialog.getByLabel('Название').fill(type)
  await typeDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(typeDialog).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: type })).toBeVisible()

  // Метка — в выборе меток, тип — в выборе типа карточки любого пространства: RCOMP и QA
  await expectChoices(page, await openCardByKey(page, 'RCOMP-1', 'Сменить тип'), label, type)
  await page.goto('/cards/QA-1')
  const qaWindow = page.getByRole('dialog')
  await expect(qaWindow.getByRole('heading').first()).toBeVisible()
  await expectChoices(page, qaWindow, label, type)

  // 5. Структура: создать папку, пространство — «Переместить в…» эту папку
  await openAdmin(page, '/admin/structure', 'Структура')
  await page.getByRole('button', { name: 'Создать папку' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'Новая папка' })
  await folderDialog.getByLabel('Название').fill(folder)
  await folderDialog.getByRole('button', { name: 'Создать' }).click()
  await expect(folderDialog).toBeHidden()
  await expect(structureRow(page, folder)).toBeVisible()
  await moveSpace(page, folder)

  // В «Структуре» (плоский список с отступом по глубине) пространство — сразу под папкой, на уровень глубже
  const spaceRow = structureRow(page, COMPANY_SPACE)
  await expect(spaceRow).toHaveCSS('padding-left', '36px')
  await expect(spaceRow.locator('xpath=preceding-sibling::li[1]')).toContainText(folder)
  // …и в дереве слева — внутри папки
  const nav = tree(page)
  const folderButton = nav.getByRole('button', { name: new RegExp(`${folder}$`) })
  await expect(folderButton).toBeVisible()
  if ((await folderButton.getAttribute('aria-expanded')) !== 'true') await folderButton.click()
  const folderItem = nav
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`${folder}$`) }) })
  await expect(folderItem.getByRole('link', { name: new RegExp(`${COMPANY_SPACE}$`) })).toBeVisible()

  // Уборка: пространство — обратно в корень (папка остаётся пустой — её видит только «Структура» и Владелец)
  await moveSpace(page, 'Корень дерева')
  await expect(spaceRow).toHaveCSS('padding-left', '12px')
})
