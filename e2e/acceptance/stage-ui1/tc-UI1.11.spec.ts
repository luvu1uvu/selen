import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, tile } from './helpers'

/**
 * ТК-UI1.11: «+» → «Чек-лист» — курсор сразу в поле названия; появляется секция «Чек-листы» с чек-листом и пунктом,
 * на плитке — прогресс «0/1». Новая карточка без чек-листов → WIN-5 «Для чек-листа» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.11. «+» → «Чек-лист» @tc-UI1.11', async ({ page }) => {
  // 1. Открыть карточку: секции «Чек-листы» нет
  const window = await openCard(page, 'Для чек-листа')
  await expect(window.getByRole('region', { name: 'Чек-листы' })).toHaveCount(0)

  // 2. «+» слева на линии под шапкой → «Чек-лист» → «Проверка», Enter → пункт «Первый»
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Чек-лист' }).click()
  const name = window.getByRole('textbox', { name: 'Название нового чек-листа' })
  await expect(name).toBeFocused()
  await page.keyboard.type('Проверка')
  await page.keyboard.press('Enter')
  const checklists = window.getByRole('region', { name: 'Чек-листы' })
  await expect(checklists.getByRole('region', { name: 'Проверка' })).toBeVisible()
  const item = checklists.getByRole('textbox', { name: 'Новый пункт в «Проверка»' })
  await item.fill('Первый')
  await item.press('Enter')
  await expect(checklists.getByText('Первый', { exact: true })).toBeVisible()
  await expect(checklists).toContainText('0/1')
  await expect(item).toHaveValue('')

  // На плитке карточки — прогресс чек-листа «0/1»
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    tile(page, 'Для чек-листа').locator('[title="Чек-листы: выполнено 0 из 1"]'),
  ).toContainText('0/1')
})
