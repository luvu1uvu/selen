import { expect, test, type Locator, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { EMPTY_FOLDER_HINT, tree, treeFolder } from './helpers'

/**
 * Пометка «пустая» — рядом с кнопкой папки (в той же строке дерева), с подсказкой Tooltip. До пачки UX-2 подсказка была
 * атрибутом title, и тест искал пометку по нему; LATER-88 заменил title на Tooltip — тест проверяет видимую подсказку.
 */
async function expectEmptyMark(page: Page, folder: Locator) {
  const mark = folder.locator('xpath=..').locator('span[tabindex="0"]', { hasText: 'пустая' })
  await expect(mark).toHaveText('пустая')
  await mark.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: EMPTY_FOLDER_HINT })).toHaveText(EMPTY_FOLDER_HINT)
  await page.keyboard.press('Escape')
}

// Вместо «Новые направления» / «Идеи на 2027» — пустые папки E2eSeeder «E2E Пустая» / «E2E Вложенная пустая».
// Что папка «бледная» — только вручную (внешний вид); подпись «пустая» проверяется здесь
test('ТК-3.29. Пустая папка видна в дереве только Владельцу @tc-3.29', async ({ browser }) => {
  // 1. Владелец: папка с подписью «пустая», внутри — вложенная, тоже «пустая»
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  const folder = treeFolder(ownerPage, 'E2E Пустая')
  await expect(folder).toBeVisible()
  await expectEmptyMark(ownerPage, folder)
  if ((await folder.getAttribute('aria-expanded')) === 'false') await folder.click()
  const nested = treeFolder(ownerPage, 'E2E Вложенная пустая')
  await expect(nested).toBeVisible()
  await expectEmptyMark(ownerPage, nested)

  // 2. Обычный администратор: папки в дереве нет
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await expect(tree(adminPage).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(tree(adminPage).getByText('E2E Пустая', { exact: true })).toHaveCount(0)
  await expect(tree(adminPage).getByText('E2E Вложенная пустая', { exact: true })).toHaveCount(0)
})
