import { expect, test } from '@playwright/test'
import { login, PASSWORD } from './helpers'

test('вход в систему: видны свои пространства', async ({ page }) => {
  await login(page, 'e2e-editor@selen.test')

  await expect(page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  // Роль — в карточке пространства QA на главной (у редактора есть и другие пространства с той же ролью)
  await expect(page.getByRole('link', { name: /Сквозные тесты/ }).getByText('Ваша роль: Редактор')).toBeVisible()
})

test('неверный пароль — понятная ошибка', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e-admin@selen.test')
  await page.getByLabel('Пароль').fill(`${PASSWORD}-wrong`)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
})
