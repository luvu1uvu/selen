import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.6 (U-9, V-1): форма новой блокировки — в рамке с заголовком «Новая блокировка»; после «Отмена» фокус на
 * кнопке, которая открыла форму: «+» — для блокировки, поле «Добавьте описание…» — для описания. Анна → e2e-editor,
 * DEV-231 (без описания) → UXB-5 «Без описания» (E2eSeeder::uxBatch2); формы отменяются — карточка не меняется.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.6. «Отмена» в форме — фокус на кнопке, которая её открыла @tc-L98.6', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-5', 'Без описания')
  const add = window.getByRole('button', { name: 'Добавить в карточку' })

  // 1. «+» → «Остальное» → «Блокировка»: форма в рамке с заголовком «Новая блокировка»; «Отмена» — фокус на «+»
  await add.click()
  await expect(page.getByRole('menu').getByText('Остальное', { exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Блокировка' }).click()
  const form = window.getByRole('form', { name: 'Новая блокировка' })
  await expect(form).toBeVisible()
  await expect(form.getByText('Новая блокировка', { exact: true })).toBeVisible()
  const border = await form.evaluate((e) => ({
    width: parseFloat(getComputedStyle(e).borderTopWidth),
    style: getComputedStyle(e).borderTopStyle,
  }))
  expect(border.width, 'форма в рамке').toBeGreaterThanOrEqual(1)
  expect(border.style).toBe('solid')
  await form.getByRole('button', { name: 'Отмена' }).click()
  await expect(form).toHaveCount(0)
  await expect(add).toBeFocused()

  // 2. «Добавьте описание…» → редактор → «Отмена» — фокус на поле «Добавьте описание…»
  const description = window.getByRole('button', { name: 'Добавьте описание…' })
  await description.click()
  const editor = window.getByRole('textbox', { name: 'Описание' })
  await expect(editor).toBeFocused()
  await window.getByRole('region', { name: 'Описание' }).getByRole('button', { name: 'Отмена' }).click()
  await expect(editor).toHaveCount(0)
  await expect(description).toBeFocused()
})
