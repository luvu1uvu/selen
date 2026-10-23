import { expect, test, type Page } from '@playwright/test'
import { colorsOf, contrast } from '../acceptance/stage-L91/helpers'
import { authFile } from './helpers'

/**
 * Уведомления (правила вида, раздел 7, «Уведомление»): поверх окна карточки нажимаются и щелчок по ним окно не закрывает
 * (LATER-102); текст `text-sm`, контраст не меньше 4,5:1, подписи для экранного диктора — по-русски (LATER-103).
 * Уведомление вызывает копирование ссылки на карточку: буфер обмена подменён — удаётся или нет по флагу страницы.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

async function openCard(page: Page) {
  await page.addInitScript(() => {
    const flags = window as unknown as { copyFails?: boolean }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => (flags.copyFails ? Promise.reject(new Error('denied')) : Promise.resolve()),
      },
    })
  })
  await page.goto('/cards/QA-3')
  const window = page.getByRole('dialog', { name: 'Блокирующая задача' })
  await expect(window).toBeVisible()
  return window
}

const copyKey = (page: Page) => page.getByRole('button', { name: /^QA-3\. / })

test('«×» уведомления поверх окна карточки закрывает уведомление, а не окно (LATER-102)', async ({ page }) => {
  const window = await openCard(page)
  await copyKey(page).click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Ссылка скопирована' })
  await expect(toast).toBeVisible()

  await toast.locator('[data-close-button]').click()

  await expect(toast).toHaveCount(0)
  await expect(window).toBeVisible()
  expect(page.url()).toMatch(/\/cards\/QA-3$/)
})

test('текст уведомлений — 14 px и не меньше 4,5:1, подписи — по-русски (LATER-103)', async ({ page }) => {
  await openCard(page)
  await expect(page.getByRole('region', { name: /^Уведомления/ })).toBeAttached()

  await copyKey(page).click()
  const success = page.locator('[data-sonner-toast][data-type="success"]')
  await expect(success).toBeVisible()
  await page.evaluate(() => ((window as unknown as { copyFails?: boolean }).copyFails = true))
  await copyKey(page).click()
  const error = page.locator('[data-sonner-toast][data-type="error"]')
  await expect(error).toBeVisible()
  // Новое уведомление — сверху, предыдущее под ним свёрнуто: раскрыть стопку, чтобы замерить оба
  await error.hover()

  for (const [what, toast] of [
    ['успех', success],
    ['ошибка', error],
  ] as const) {
    const title = toast.locator('[data-title]')
    const colors = await colorsOf(toast)
    const text = (await colorsOf(title)).text
    expect(contrast(text, colors.background), `${what}: контраст`).toBeGreaterThanOrEqual(4.5)
    expect(await title.evaluate((element) => getComputedStyle(element).fontSize), what).toBe('14px')
    await expect(toast.getByRole('button', { name: 'Закрыть уведомление' })).toBeVisible()
  }
})
