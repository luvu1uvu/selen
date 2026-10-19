import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { tree, treeFolder } from './helpers'

/**
 * Вместо «Новые направления» / «Идеи на 2027» — свои пустые папки: тест их создаёт (через «+» в дереве) и в конце
 * удаляет, папки E2eSeeder «E2E Пустая» остаются для ТК-3.29 и ТК-3.31.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

async function createFolder(page: Page, addButton: string, name: string) {
  await page.getByRole('button', { name: addButton }).click()
  await page.getByRole('menuitem', { name: 'Папку' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая папка' })
  await dialog.getByLabel('Название').fill(name)
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(dialog).toBeHidden()
}

async function openFolderMenu(page: Page, name: string) {
  // Предыдущее меню успело закрыться — пункт «Удалить навсегда…» будет один
  await expect(page.getByRole('menu')).toHaveCount(0)
  await treeFolder(page, name).hover()
  await tree(page).getByRole('button', { name: `Меню «${name}»` }).click()
  return page.getByRole('menuitem', { name: 'Удалить навсегда…' })
}

async function deleteFolder(page: Page, name: string) {
  await (await openFolderMenu(page, name)).click()
  const dialog = page.getByRole('dialog', { name: 'Удалить папку навсегда?' })
  await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Папка удалена').first()).toBeVisible()
}

test('ТК-3.34. Владелец удаляет пустую папку прямо из дерева @tc-3.34', async ({ page }) => {
  const stamp = Date.now()
  const parent = `E2E Направления ${stamp}`
  const child = `E2E Идеи ${stamp}`
  await openHome(page)

  // Подготовка: пустая папка с вложенной пустой — обе видны Владельцу в дереве
  await createFolder(page, 'Добавить в дерево', parent)
  await expect(treeFolder(page, parent)).toBeVisible()
  await treeFolder(page, parent).hover()
  await createFolder(page, `Добавить в «${parent}»`, child)
  if ((await treeFolder(page, parent).getAttribute('aria-expanded')) === 'false') await treeFolder(page, parent).click()
  await expect(treeFolder(page, child)).toBeVisible()
  // Пока внутри есть вложенная папка, удалить родительскую нельзя
  await expect(await openFolderMenu(page, parent)).toBeDisabled()
  await page.keyboard.press('Escape')

  // 1. «⋯» у вложенной → «Удалить навсегда…» → подтвердить: папка пропала из дерева
  await deleteFolder(page, child)
  await expect(tree(page).getByText(child, { exact: true })).toHaveCount(0)

  // 2. «⋯» у родительской: «Удалить навсегда…» доступен
  await expect(await openFolderMenu(page, parent)).toBeEnabled()
  await page.keyboard.press('Escape')

  // Уборка: удалить и родительскую
  await deleteFolder(page, parent)
  await expect(tree(page).getByText(parent, { exact: true })).toHaveCount(0)
})
