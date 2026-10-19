import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { EMPTY_FOLDER_HINT, tree, treeFolder } from './helpers'

// Вместо «Новые направления» / «Идеи на 2027» — пустые папки E2eSeeder «E2E Пустая» / «E2E Вложенная пустая».
// Что папка «бледная» — только вручную (внешний вид); подпись «пустая» проверяется здесь
test('ТК-3.29. Пустая папка видна в дереве только Владельцу @tc-3.29', async ({ browser }) => {
  // 1. Владелец: папка с подписью «пустая», внутри — вложенная, тоже «пустая»
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  const folder = treeFolder(ownerPage, 'E2E Пустая')
  await expect(folder).toBeVisible()
  await expect(folder.getByTitle(EMPTY_FOLDER_HINT)).toHaveText('пустая')
  if ((await folder.getAttribute('aria-expanded')) === 'false') await folder.click()
  const nested = treeFolder(ownerPage, 'E2E Вложенная пустая')
  await expect(nested).toBeVisible()
  await expect(nested.getByTitle(EMPTY_FOLDER_HINT)).toHaveText('пустая')

  // 2. Обычный администратор: папки в дереве нет
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await expect(tree(adminPage).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(tree(adminPage).getByText('E2E Пустая', { exact: true })).toHaveCount(0)
  await expect(tree(adminPage).getByText('E2E Вложенная пустая', { exact: true })).toHaveCount(0)
})
