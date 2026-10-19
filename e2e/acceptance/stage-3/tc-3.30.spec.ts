import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { structureRow, tree, treeFolder } from './helpers'

// Вместо «Операции» (OPS, MKT) — папка E2eSeeder «E2E Мобильные» с пространством MOB: у e2e-owner нет ролей
// ни в одном пространстве
test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-3.30. Папка без доступных пространств не видна и Владельцу @tc-3.30', async ({ page }) => {
  // 1. Дерево: только пустые папки, папки с чужими пространствами и самих пространств нет, пометок «нет доступа» нет
  await openHome(page)
  const nav = tree(page)
  await expect(treeFolder(page, 'E2E Пустая')).toBeVisible()
  await expect(nav.getByText('E2E Мобильные')).toHaveCount(0)
  await expect(nav.getByText('Мобильные приложения')).toHaveCount(0)
  await expect(nav.getByText('Сквозные тесты')).toHaveCount(0)
  await expect(nav.getByText(/нет доступа/i)).toHaveCount(0)

  // 2. «Администрирование» → «Структура»: папка и её пространство есть
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('link', { name: 'Структура' }).click()
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
  await expect(structureRow(page, 'E2E Мобильные')).toBeVisible()
  await expect(structureRow(page, 'Мобильные приложения')).toBeVisible()
})
