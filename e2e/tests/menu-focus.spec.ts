import { expect, test, type Locator } from '@playwright/test'
import { authFile, openHome } from './helpers'

/**
 * LATER-115: пункт меню в фокусе с клавиатуры отмечен не одной заливкой (`accent` — 1,09:1 к меню), а рамкой цвета ring
 * 2 px внутри пункта; от наведения мышью — только заливка. Регрессии: у пунктов `outline-hidden`, а он в Tailwind 4
 * обнуляет и стиль рамки — без `outline-solid` рамки не было (найдено при самопроверке «Редизайна», шаг 2); Radix сам ставит
 * фокус на пункт под указателем, Chromium считает его `:focus-visible` — рамка гаснет по `data-pointer-focus` меню.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const outline = (item: Locator) =>
  item.evaluate((element) => {
    const style = getComputedStyle(element)
    return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`
  })
const INNER_RING = 'solid 2px rgb(79, 70, 229) -2px'

test('пункт меню в фокусе с клавиатуры — рамка внутри пункта; от наведения мышью — только заливка', async ({ page }) => {
  await openHome(page)
  const trigger = page.getByRole('button', { name: 'Меню пользователя' })

  // Мышью: щелчок открывает меню, наведение подсвечивает пункт заливкой (Radix ставит на него фокус), рамки нет
  await trigger.click()
  const profile = page.getByRole('menuitem', { name: 'Профиль' })
  await profile.hover()
  await expect(profile).toBeFocused()
  await expect(profile).toHaveAttribute('data-highlighted', '')
  expect(await outline(profile)).toMatch(/^none /)
  await page.keyboard.press('Escape')
  await expect(profile).toBeHidden()

  // С клавиатуры: Enter открывает меню, стрелки — по пунктам (переключатель темы и обычный пункт)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitemradio', { name: 'Светлая' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const dark = page.getByRole('menuitemradio', { name: 'Тёмная' })
  await expect(dark).toBeFocused()
  expect(await outline(dark)).toBe(INNER_RING)
  await page.keyboard.press('End')
  const logout = page.getByRole('menuitem', { name: 'Выйти' })
  await expect(logout).toBeFocused()
  expect(await outline(logout)).toBe(INNER_RING)
  // Указатель над пунктом гасит рамку, следующая клавиша возвращает
  await profile.hover()
  await expect(profile).toBeFocused()
  expect(await outline(profile)).toMatch(/^none /)
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitemradio', { name: 'Как в системе' })).toBeFocused()
  expect(await outline(page.getByRole('menuitemradio', { name: 'Как в системе' }))).toBe(INNER_RING)
  await page.keyboard.press('Escape')
})
