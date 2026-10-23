import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { BOARD, param } from './helpers'

/**
 * ТК-UI1.21: на узком экране (телефон) окно — на весь экран, поля «Основных параметров» — название над значением,
 * горизонтальной прокрутки нет; ✕ закрывает окно. Окно браузера ~400 px → 375×812; доска «Продукт» → «Окно»
 * пространства WIN, карточка WIN-18 «Просто карточка» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: { width: 375, height: 812 } })

test('ТК-UI1.21. Узкий экран — окно на весь экран @tc-UI1.21', async ({ page }) => {
  // 1. Доска → открыть карточку
  await page.goto('/spaces/WIN')
  await page
    .getByRole('region', { name: BOARD, exact: true })
    .getByRole('button', { name: /^Открыть WIN-\d+: Просто карточка$/ })
    .click()
  const window = page.getByRole('dialog', { name: 'Просто карточка' })
  await expect(window).toBeVisible()

  // Окно занимает весь экран
  expect(await window.boundingBox()).toEqual({ x: 0, y: 0, width: 375, height: 812 })

  // Поля «Основных параметров» — название над значением
  const main = window.getByRole('region', { name: 'Основные параметры' })
  // Пачка UX-2 (решение PM 22.10): «План, ч», пока не задан, скрыт — вместо него проверяется «Срочно» (строка есть всегда)
  for (const name of ['Расположение', 'Тип', 'Ответственный', 'Срочно']) {
    const label = (await main.locator('dt', { hasText: name }).boundingBox())!
    const value = (await param(main, name).boundingBox())!
    expect(value.y, name).toBeGreaterThanOrEqual(label.y + label.height - 1)
    expect(Math.abs(value.x - label.x), name).toBeLessThan(2)
  }

  // Горизонтальной прокрутки нет — ни у страницы, ни у прокручиваемых областей окна
  const overflow = await window.evaluate((element) => {
    const scrollers = [element, ...element.querySelectorAll<HTMLElement>('*')].filter((e) =>
      ['auto', 'scroll'].includes(getComputedStyle(e).overflowX),
    )
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      window: Math.max(0, ...scrollers.map((e) => e.scrollWidth - e.clientWidth)),
    }
  })
  expect(overflow).toEqual({ page: 0, window: 0 })

  // ✕ закрывает окно
  await window.getByRole('button', { name: 'Закрыть' }).click()
  await expect(window).toBeHidden()
  await expect(page).toHaveURL(/\/spaces\/WIN$/)
})
