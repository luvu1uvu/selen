import { expect, test, type Locator } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Рамка фокуса — решения PM 22.10 по UX-ревью LATER-91 (токен ring #737373 без прозрачности):
 * - U-1: у вкладок — только при работе с клавиатуры. Radix ставит фокус на вкладку сам при нажатии мыши, и сразу после
 *   загрузки страницы браузер считает его `:focus-visible` — рамка появлялась от щелчка;
 * - U-7: у полей ввода — 2 px (у кнопок и вкладок — 3 px).
 * Пространство ROWS «Ряды» (E2eSeeder), e2e-admin — администратор. Окно метки только открывается и закрывается.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const RING_COLOR = String.raw`(oklch\(0\.556 0 0\)|rgb\(115, 115, 115\))`
const ring = (width: number) => new RegExp(`${RING_COLOR} 0px 0px 0px ${width}px`)

/** Тень элемента после того, как закончились переходы (у вкладок и полей — transition box-shadow). */
async function settledShadow(locator: Locator) {
  return locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
    return getComputedStyle(element).boxShadow
  })
}

test('вкладки: щелчок мышью — без рамки фокуса, стрелка — рамка 3 px', async ({ page }) => {
  await page.goto('/spaces/ROWS')
  await expect(page.getByRole('heading', { name: 'Ряды', level: 1 })).toBeVisible()
  // Первый список вкладок — панели пространства
  const tabs = page.getByRole('tablist').first()
  const members = tabs.getByRole('tab', { name: 'Участники' })

  await members.click()
  await expect(members).toHaveAttribute('aria-selected', 'true')
  await expect(members).toBeFocused()
  expect(await settledShadow(members), 'рамки от щелчка нет').not.toMatch(ring(3))

  await page.keyboard.press('ArrowRight')
  const labels = tabs.getByRole('tab', { name: 'Метки' })
  await expect(labels).toBeFocused()
  await expect(labels).toHaveCSS('box-shadow', ring(3))
  // Вкладка, с которой ушли стрелкой, — без рамки
  expect(await settledShadow(members)).not.toMatch(ring(3))
})

test('поле ввода в фокусе — рамка 2 px', async ({ page }) => {
  await page.goto('/spaces/ROWS')
  await page.getByRole('tablist').first().getByRole('tab', { name: 'Метки' }).click()
  await page.getByRole('button', { name: 'Добавить метку' }).click()
  const dialog = page.getByRole('dialog')
  const name = dialog.getByRole('textbox', { name: 'Название' })
  await name.focus()
  await expect(name).toBeFocused()
  await expect(name).toHaveCSS('box-shadow', ring(2))
  expect(await settledShadow(name)).not.toMatch(ring(3))
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
