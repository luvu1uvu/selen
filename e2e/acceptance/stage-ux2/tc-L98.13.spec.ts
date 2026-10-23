import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectHint } from '../stage-ux1/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.13 (U-4, WAI-ARIA toolbar): панель форматирования — одна остановка Tab: Shift+Tab из редактора — на «Жирный»,
 * стрелки ходят по кнопкам (подсказки — их названия), Tab из панели — сразу в текст. Анна → e2e-editor, DEV-231 →
 * UXB-5 «Без описания» (E2eSeeder::uxBatch2); описание не сохраняется.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.13. Панель форматирования — одна остановка Tab @tc-L98.13', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-5', 'Без описания')
  const description = window.getByRole('region', { name: 'Описание' })

  // 1. «Добавьте описание…» — курсор в редакторе
  await description.getByRole('button', { name: 'Добавьте описание…' }).click()
  const editor = description.getByRole('textbox', { name: 'Описание' })
  await expect(editor).toBeFocused()

  // Панель — одна остановка Tab: только одна кнопка в порядке обхода
  const toolbar = description.getByRole('toolbar', { name: 'Форматирование' })
  const buttons = toolbar.getByRole('button')
  expect(await buttons.count()).toBeGreaterThanOrEqual(12)
  expect(await buttons.evaluateAll((all) => all.filter((b) => (b as HTMLElement).tabIndex === 0).length)).toBe(1)

  // 2. Shift+Tab — фокус на «Жирный»; стрелки двигают его по кнопкам, подсказки — их названия
  await page.keyboard.press('Shift+Tab')
  await expect(toolbar.getByRole('button', { name: 'Жирный' })).toBeFocused()
  await expectHint(page, 'Жирный')
  await page.keyboard.press('ArrowRight')
  await expect(toolbar.getByRole('button', { name: 'Курсив' })).toBeFocused()
  await expectHint(page, 'Курсив')
  await page.keyboard.press('ArrowRight')
  await expect(toolbar.getByRole('button', { name: 'Зачёркнутый' })).toBeFocused()
  await expectHint(page, 'Зачёркнутый')

  // Tab из панели — сразу в текст редактора
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()

  // Отмена — описание не сохраняется
  await description.getByRole('button', { name: 'Отмена' }).click()
  await expect(editor).toHaveCount(0)
})
