import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, param, tile } from './helpers'

/**
 * ТК-UI1.27 (LATER-97): срок и метки, пока не заданы, скрыты; «+» → «Срок» / «Метки» показывает строку и сразу
 * открывает выбор; закрыли без значения — строки снова нет. Расположение, тип, ответственный, участники — всегда.
 * Анна → e2e-editor, карточка WIN «Срок и метки через плюс» (E2eSeeder), метка «Окно».
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

/** Завтрашняя дата (часовой пояс браузера тестов — Europe/Moscow) в формате поля даты. */
function tomorrow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(
    Date.now() + 86_400_000,
  )
}

test('ТК-UI1.27. Срок и метки появляются через «+» @tc-UI1.27', async ({ page }) => {
  // 1. Карточка без срока и меток: этих строк нет, остальные на месте
  const window = await openCard(page, 'Срок и метки через плюс')
  const main = window.getByRole('region', { name: 'Основные параметры' })
  await expect(main.locator('dt')).toHaveText([
    'Расположение',
    'Тип',
    'Ответственный',
    'Участники',
    'Срочно',
  ])
  // Пачка UX-2 (решение PM 22.10): «План, ч», пока не задан, тоже скрыт и добавляется через «+»
  const add = window.getByRole('button', { name: 'Добавить в карточку' })

  // 2. «+» → «Срок»: строка появилась, выбор даты открыт; Esc без даты — строки снова нет, окно открыто
  await add.click()
  await page.getByRole('menuitem', { name: 'Срок' }).click()
  const date = page.getByRole('textbox', { name: 'Дата срока' })
  await expect(date).toBeFocused()
  await expect(main.locator('dt', { hasText: 'Срок' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(date).toHaveCount(0)
  await expect(main.locator('dt', { hasText: 'Срок' })).toHaveCount(0)
  await expect(window).toBeVisible()

  // 3. «+» → «Срок» → завтрашняя дата: строка «Срок» с датой осталась
  await add.click()
  await page.getByRole('menuitem', { name: 'Срок' }).click()
  await date.fill(tomorrow())
  await expect(page.getByText('Сохранено').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(param(main, 'Срок')).toContainText(/\d/)

  // 4. «+» → «Метки» → «Окно»: строка «Метки» с меткой
  await add.click()
  await page.getByRole('menuitem', { name: 'Метки' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Окно' }).click()
  await page.keyboard.press('Escape')
  await expect(param(main, 'Метки')).toContainText('Окно')

  // На плитке — срок и метка
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await expect(tile(page, 'Срок и метки через плюс').locator('[title="Окно"]')).toBeVisible()
})
