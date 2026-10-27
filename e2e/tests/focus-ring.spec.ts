import { expect, test, type Locator } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Рамка фокуса — решения PM 22.10 по UX-ревью LATER-91 и решение PM 26.10 по шагу 1 «Редизайна» (п. 5: цветом акцента
 * `ring` = `primary` #4f46e5, 2 px с отступом 2 px; ADR-0025):
 * - U-1: у вкладок — только при работе с клавиатуры. Radix ставит фокус на вкладку сам при нажатии мыши, и сразу после
 *   загрузки страницы браузер считает его `:focus-visible` — рамка появлялась от щелчка;
 * - U-7: у полей ввода — 2 px без отступа (`ring-2`); у кнопок и вкладок — общая рамка `outline` 2 px с отступом 2 px.
 * Пространство ROWS «Ряды» (E2eSeeder), e2e-admin — администратор. Окно метки только открывается и закрывается.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

// Акцент «Линии» — #4f46e5 (было #737373 до «Редизайна»)
const RING_COLOR = String.raw`rgb\(79, 70, 229\)`
const ring = (width: number) => new RegExp(`${RING_COLOR} 0px 0px 0px ${width}px`)

/** Общая рамка фокуса: outline 2 px цветом акцента с отступом 2 px; нет рамки — outline-style none. */
async function outlineOf(locator: Locator) {
  return locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset }
  })
}
const FOCUS_OUTLINE = { style: 'solid', width: '2px', color: 'rgb(79, 70, 229)', offset: '2px' }

/** Тень элемента после того, как закончились переходы (у вкладок и полей — transition box-shadow). */
async function settledShadow(locator: Locator) {
  return locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
    return getComputedStyle(element).boxShadow
  })
}

test('вкладки: щелчок мышью — без рамки фокуса, стрелка — рамка', async ({ page }) => {
  await page.goto('/spaces/ROWS')
  await expect(page.getByRole('heading', { name: 'Ряды', level: 1 })).toBeVisible()
  // Первый список вкладок — панели пространства
  const tabs = page.getByRole('tablist').first()
  const members = tabs.getByRole('tab', { name: 'Участники' })

  await members.click()
  await expect(members).toHaveAttribute('aria-selected', 'true')
  await expect(members).toBeFocused()
  expect((await outlineOf(members)).style, 'рамки от щелчка нет').toBe('none')

  await page.keyboard.press('ArrowRight')
  const labels = tabs.getByRole('tab', { name: 'Метки' })
  await expect(labels).toBeFocused()
  expect(await outlineOf(labels)).toEqual(FOCUS_OUTLINE)
  // Вкладка, с которой ушли стрелкой, — без рамки
  expect((await outlineOf(members)).style).toBe('none')
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
  // У поля — своя рамка без отступа, общей рамки (outline) нет
  expect((await outlineOf(name)).style).toBe('none')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
