import { expect, test, type Page } from '@playwright/test'
import { pageAs } from './helpers'

/**
 * Доступ через группу (ADR-0012): системный администратор добавляет человека в группу — у него сразу
 * появляется пространство; исключает — со следующего запроса пространства и карточек для него нет.
 */
test('доступ через группу появляется и исчезает', async ({ browser }) => {
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await adminPage.goto('/admin/groups')
  await adminPage.getByRole('link', { name: 'E2E Аналитики' }).click()
  await expect(adminPage.getByRole('heading', { name: 'E2E Аналитики' })).toBeVisible()
  // Повтор теста после сбоя: человек мог остаться в группе
  await removeFromGroup(adminPage, { ifPresent: true })

  const analystPage = await pageAs(browser, 'e2e-analyst@selen.test')
  await expect(analystPage.getByText('У вас пока нет доступа ни к одному пространству')).toBeVisible()

  // Добавить в группу — пространство появляется
  await adminPage.getByLabel('Добавить в группу').fill('E2E Анал')
  await adminPage.getByRole('button', { name: /E2E Аналитик e2e-analyst/ }).click()
  await adminPage.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(adminPage.getByText('E2E Аналитик добавлен(а) в группу')).toBeVisible()

  await analystPage.reload()
  const nav = analystPage.getByRole('navigation', { name: 'Дерево' })
  await nav.getByRole('link', { name: /Сквозные тесты/ }).click()
  await expect(analystPage.getByRole('heading', { name: 'Сквозные тесты' })).toBeVisible()
  await analystPage.goto('/cards/QA-1')
  await expect(analystPage.getByRole('dialog').getByText('Существующая задача')).toBeVisible()

  // Исключить из группы — со следующего запроса доступа нет, в том числе по прямой ссылке
  await removeFromGroup(adminPage)

  await analystPage.goto('/spaces/QA')
  await expect(analystPage.getByText('Пространство не найдено')).toBeVisible()
  await analystPage.goto('/cards/QA-1')
  await expect(analystPage.getByText('Карточка не найдена')).toBeVisible()
  await expect(analystPage.getByText('Существующая задача')).toHaveCount(0)
})

async function removeFromGroup(page: Page, { ifPresent = false } = {}) {
  const remove = page.getByRole('button', { name: 'Исключить E2E Аналитик из группы' })
  if (ifPresent && (await remove.count()) === 0) return
  await remove.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Исключить' }).click()
  await expect(page.getByText('Исключён(а) из группы')).toBeVisible()
}
