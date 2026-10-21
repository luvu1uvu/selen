import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP } from './helpers'

/**
 * ТК-L74.6 (U-5 UX-ревью, дополнение PM 21.10): при загрузке страницы в консоли нет предупреждения React Router
 * «No `HydrateFallback` element provided…»; пока грузится код страницы, слева уже видны полоса разделов и дерево, на месте
 * страницы — «Загрузка…». Чтобы «может мелькнуть» было видно наверняка, код страницы (отдельный чанк production-сборки)
 * приходит с задержкой. «Разработка» → RACC «Приёмка рядов» (E2eSeeder); «Структура» — только системному
 * администратору: e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

/** Код страницы (чанк StructurePage-….js / SpacePage-….js) приходит через 1,5 с; сколько раз его запросили. */
async function slowChunk(page: Page, name: string) {
  const hits = { count: 0 }
  await page.route(new RegExp(`/assets/${name}-[^/]+\\.js$`), async (route) => {
    hits.count++
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  return hits
}

/** Пока код страницы грузится: каркас с деревом виден, на месте страницы — «Загрузка…». */
async function expectLoadingInPlace(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Дерево' })).toBeVisible()
  await expect(page.getByRole('main').getByText('Загрузка…', { exact: true })).toBeVisible()
}

test('ТК-L74.6. Загрузка страницы без предупреждения в консоли @tc-L74.6', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('HydrateFallback')) warnings.push(message.text())
  })

  // 1. Страница пространства, затем обновить
  await page.goto('/spaces/RACC')
  await expect(page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })).toBeVisible()
  const space = await slowChunk(page, 'SpacePage')
  await page.reload()
  await expectLoadingInPlace(page)
  await expect(page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })).toBeVisible()
  expect(space.count).toBeGreaterThan(0)

  // 2. Администрирование → «Структура», затем обновить
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('navigation', { name: 'Администрирование' }).getByRole('link', { name: 'Структура', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
  const structure = await slowChunk(page, 'StructurePage')
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Администрирование' })).toBeVisible()
  await expect(page.getByRole('main').getByText('Загрузка…', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
  expect(structure.count).toBeGreaterThan(0)

  // В консоли — ни одного предупреждения о HydrateFallback
  expect(warnings).toEqual([])
})
