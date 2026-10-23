import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import { colorsOf, contrast, hex } from '../stage-L91/helpers'
import { DESKTOP, openCardByKey, tokenHex, WINDOW_CARD } from './helpers'

/**
 * ТК-L103.1 (LATER-103): уведомление «Сохранено» — в цветах Selen: тёмно-зелёный текст (`--success-foreground`) на
 * светло-зелёном фоне (`--success-surface`) со светло-зелёной рамкой (`--success-border`), «×» в той же гамме; шрифт —
 * как у текста окна и не мельче, контраст текста не меньше 4,5:1. Рамка и шрифт — мягкие проверки: тест сообщает обе. Анна → e2e-editor, DEV-41 → UXB-1 «Как DEV-41»
 * (E2eSeeder::uxBatch2); «Срочно» ставится и снимается — карточка остаётся как была.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L103.1. Уведомления — читаемый текст в цветах Selen @tc-L103.1', async ({ page }) => {
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)
  const main = window.getByRole('region', { name: 'Основные параметры' })
  const urgent = main.getByRole('checkbox', { name: 'Срочно' })

  // 1. Поставить флажок «Срочно» — уведомление «Сохранено»
  await urgent.click()
  const toast = page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: 'Сохранено' }).first()
  await expect(toast).toBeVisible()
  const title = toast.locator('[data-title]')
  const close = toast.getByRole('button', { name: 'Закрыть уведомление' })
  const box = await colorsOf(toast)
  const text = (await colorsOf(title)).text
  const cross = await colorsOf(close)
  const font = await title.evaluate((e) => ({ size: getComputedStyle(e).fontSize, family: getComputedStyle(e).fontFamily }))
  const windowText = await param(main, 'Расположение').evaluate((e) => ({
    size: getComputedStyle(e).fontSize,
    family: getComputedStyle(e).fontFamily,
  }))

  // …и снять его: карточка — как была
  await urgent.click()
  await expect(urgent).not.toBeChecked()

  const want = {
    text: await tokenHex(page, 'success-foreground'),
    surface: await tokenHex(page, 'success-surface'),
    border: await tokenHex(page, 'success-border'),
  }
  // Тёмно-зелёный текст на светло-зелёном фоне, читается (не меньше 4,5:1)
  expect(hex(text), 'текст — тёмно-зелёный (--success-foreground)').toBe(want.text)
  expect(hex(box.background), 'фон — светло-зелёный (--success-surface)').toBe(want.surface)
  expect(contrast(text, box.background), 'контраст текста').toBeGreaterThanOrEqual(4.5)
  // Шрифт не мельче текста окна
  expect(parseFloat(font.size), 'размер шрифта').toBeGreaterThanOrEqual(parseFloat(windowText.size))
  // «×» — в той же гамме
  expect(hex(cross.text), '«×»: значок тёмно-зелёный').toBe(want.text)
  expect(hex(cross.background), '«×»: фон светло-зелёный').toBe(want.surface)
  // Рамка — светло-зелёная (--success-border), а не цвета текста
  expect.soft(hex(box.border), 'рамка уведомления — светло-зелёная (--success-border)').toBe(want.border)
  expect.soft(hex(cross.border), '«×»: рамка светло-зелёная (--success-border)').toBe(want.border)
  // Шрифт — тот же, что у текста окна (стандартный sans Tailwind, правила вида, раздел 6), а не свой стек sonner
  expect.soft(font.family, 'шрифт как у текста окна').toBe(windowText.family)
})
