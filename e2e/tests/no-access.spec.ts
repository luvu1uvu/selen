import { expect, test } from '@playwright/test'
import { authFile, openHome } from './helpers'

test.use({ storageState: authFile('e2e-outsider@selen.test') })

test('без доступа к пространству прямая ссылка на карточку — «не найдено»', async ({ page }) => {
  await openHome(page)

  // Пространства нет в навигации
  await expect(page.getByText('У вас пока нет доступа ни к одному пространству')).toBeVisible()

  await page.goto('/cards/QA-1')
  await expect(page.getByText('Карточка не найдена')).toBeVisible()
  await expect(page.getByText('Существующая задача')).toHaveCount(0)

  // API отвечает так же, как на несуществующую карточку.
  // Referer — как у SPA: по нему Sanctum понимает, что запрос идёт с cookie-сессией.
  // Как SPA: X-Selen-User — пользователь вкладки (без него запрос с сессией не выполняется, ADR-0002)
  const base = { Accept: 'application/json', Referer: new URL('/', page.url()).toString() }
  const me = (await (await page.request.get('/api/v1/auth/me', { headers: base })).json()) as { data: { id: string } }
  const headers = { ...base, 'X-Selen-User': me.data.id }
  const foreign = await page.request.get('/api/v1/cards/QA-1', { headers })
  const missing = await page.request.get('/api/v1/cards/QA-999', { headers })
  expect(foreign.status()).toBe(404)
  expect(await foreign.json()).toEqual(await missing.json())
})
