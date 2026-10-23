import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey, WINDOW_CARD } from './helpers'

/**
 * ТК-L98.4 (UX-ревью UI-1b): браузер не дал скопировать — окно «Скопируйте ссылку» с пояснением и полем, где ссылка на
 * карточку выделена; ✕ или Esc закрывает окно, окно карточки остаётся. Стек E2E открыт не по https и не по localhost —
 * буфера обмена у страницы нет, как на стенде по адресу tailnet (для надёжности он и убран явно). Анна → e2e-editor,
 * DEV-41 → UXB-1 «Как DEV-41» (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.4. Браузер не дал скопировать — окно с ссылкой @tc-L98.4', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)
  const number = window.getByRole('button', { name: `${WINDOW_CARD.key}. Скопировать ссылку на карточку` })

  // 1. Щёлкнуть номер под названием — окно «Скопируйте ссылку»: пояснение и поле с выделенной ссылкой
  await number.click()
  const dialog = page.getByRole('dialog', { name: 'Скопируйте ссылку' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Браузер не дал доступа к буферу обмена')
  const field = dialog.getByRole('textbox')
  const url = new URL(`/cards/${WINDOW_CARD.key}`, page.url()).toString()
  await expect(field).toHaveValue(url)
  await expect(field).toBeFocused()
  expect(
    await field.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!)),
    'ссылка выделена целиком',
  ).toBe(url)
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Ссылка скопирована' })).toHaveCount(0)

  // Esc закрывает окно, окно карточки остаётся
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(window).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/cards/${WINDOW_CARD.key}$`))

  // ✕ — так же
  await number.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(window).toBeVisible()
})
