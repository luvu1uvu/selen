import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../tests/helpers'
import { BOARD, expectDarkScreen, SPACE } from './helpers'

/**
 * Тёмная тема на основных экранах («Редизайн», шаг 2; ADR-0025): у e2e-dark сохранена «Тёмная» (E2eSeeder::darkTheme),
 * система тоже тёмная. На каждом экране — тёмный фон, ни одного светлого пятна (элемент с непрозрачным светлым фоном,
 * кроме цветов пользователя), текст не ниже AA (axe-core `color-contrast`). Данные только смотрим.
 */
test.use({ storageState: authFile('e2e-dark@selen.test') })

test('доска и меню пользователя', async ({ page }) => {
  await openHome(page)
  await openBoard(page, SPACE, BOARD)
  await expect(page.locator('[data-card-tile]')).toHaveCount(6)
  await expectDarkScreen(page, 'доска')

  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true')
  await expectDarkScreen(page, 'меню пользователя')
})

test('окно карточки', async ({ page }) => {
  await page.goto('/cards/DARK-4')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Полная карточка' })).toBeVisible()
  await expect(dialog.getByText('Комментарий в тёмной теме')).toBeVisible()
  await expect(dialog.locator('figure img')).toBeVisible()
  await expectDarkScreen(page, 'окно карточки')

  // Заблокированная — плашка блокировки в окне
  await page.goto('/cards/DARK-1')
  await expect(page.getByRole('dialog').getByText('Ждём доступ к стенду')).toBeVisible()
  await expectDarkScreen(page, 'окно заблокированной карточки')
})

test('страница пространства', async ({ page }) => {
  await page.goto('/spaces/DARK')
  await expect(page.getByRole('heading', { name: SPACE, level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: BOARD }).locator('[data-card-tile]')).toHaveCount(6)
  await expectDarkScreen(page, 'пространство')
})

test('админка: пользователи', async ({ page }) => {
  await openHome(page)
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('link', { name: 'Пользователи' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(page.getByRole('cell', { name: /E2E Тёмная тема/ }).first()).toBeVisible()
  await expectDarkScreen(page, 'админка')
})

test('вход: тема устройства, пока пользователь неизвестен', async ({ browser, baseURL }) => {
  // Без сессии; в браузере — копия темы прошлого пользователя устройства
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: 'selen.theme', value: 'dark' }] }] },
  })
  const page = await context.newPage()
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expectDarkScreen(page, 'вход')
  await context.close()
})
