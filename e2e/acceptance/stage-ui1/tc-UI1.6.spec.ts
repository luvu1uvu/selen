import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectNewToast, openCard, tile, trackToasts } from './helpers'

/**
 * ТК-UI1.6: название правится прямо в шапке — Enter сохраняет («Сохранено»), Esc отменяет правку и окно не
 * закрывает; на плитке — новое название. Карточка → WIN-2 «Название правится» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.6. Название правится на месте @tc-UI1.6', async ({ page }) => {
  const window = await openCard(page, 'Название правится')
  await trackToasts(page)
  const title = window.getByRole('textbox', { name: 'Название' })

  // 1. Щёлкнуть по названию, дописать « (проверка)», Enter — «Сохранено»
  await title.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' (проверка)')
  await expectNewToast(page, 'Сохранено', () => page.keyboard.press('Enter'))
  await expect(title).toHaveValue('Название правится (проверка)')

  // 2. Ещё раз — дописать « ещё», Esc: правка отменена, окно не закрылось
  await title.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ещё')
  await expect(title).toHaveValue('Название правится (проверка) ещё')
  await page.keyboard.press('Escape')
  await expect(title).toHaveValue('Название правится (проверка)')
  await expect(page.getByRole('dialog', { name: 'Название правится (проверка)' })).toBeVisible()

  // 3. Закрыть окно — на плитке новое название
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile(page, 'Название правится (проверка)')).toBeVisible()
})
