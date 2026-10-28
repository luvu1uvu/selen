import { expect, test } from '@playwright/test'
import { pageAs } from './helpers'

/**
 * Окна админки (UX-ревью П2c-1; docs/ui-guidelines.md, разделы 4 и 11): окно не выше экрана — прокручивается его
 * содержимое, и кнопка отправки достижима (U-1); после «Добавить пространство» фокус на поле новой строки, после × —
 * на × соседней строки (U-2), у × — название пространства (U-6). Jsdom раскладку не считает — поэтому E2E.
 */
test('«Пригласить» с шестью пространствами помещается в экран 1280×720; фокус не теряется', async ({ browser }) => {
  const page = await pageAs(browser, 'e2e-owner@selen.test')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })

  const spaces = dialog.getByRole('combobox', { name: 'Пространство' })
  for (let row = 0; row < 6; row++) {
    await dialog.getByRole('button', { name: 'Добавить пространство' }).click()
    await expect(spaces.nth(row)).toBeFocused()
  }

  const box = await dialog.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(720)
  const submit = dialog.getByRole('button', { name: 'Отправить приглашение' })
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeInViewport()

  // × второй строки с клавиатуры: строка убрана, фокус — на × следующей (теперь второй) строки, в подписи — пространство
  const removes = dialog.getByRole('button', { name: /^Убрать «.+»$/ })
  const third = await spaces.nth(2).locator('option:checked').textContent()
  await removes.nth(1).focus()
  await page.keyboard.press('Enter')
  await expect(removes).toHaveCount(5)
  await expect(removes.nth(1)).toBeFocused()
  await expect(removes.nth(1)).toHaveAccessibleName(`Убрать «${third}»`)
})
