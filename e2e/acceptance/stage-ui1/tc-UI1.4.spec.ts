import { expect, test } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, loaded, PRODUCT } from '../stage-layout/rows'
import { copiedText, menuItems, stubClipboard } from './helpers'

/**
 * ТК-UI1.4: ссылка на карточку («⋯» → «Скопировать ссылку»), открытая в новой вкладке, открывает доску и окно поверх
 * неё; Esc закрывает окно, адрес — адрес доски, «Назад» карточку снова не открывает. «Продукт» демо-данных → RACC
 * «Приёмка рядов» → «Продукт»; Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.4. Прямая ссылка открывает доску и окно поверх @tc-UI1.4', async ({
  page,
  context,
}) => {
  // 1. Открыть карточку на доске «Продукт», «⋯» → «Скопировать ссылку»
  await stubClipboard(page)
  await openHome(page)
  await openSpaceBoard(page, 'Приёмка рядов', PRODUCT)
  await loaded(page, PRODUCT)
  await block(page, PRODUCT)
    .getByRole('button', { name: /^Открыть RACC-\d+: Задача продукта 4$/ })
    .click()
  const window = page.getByRole('dialog', { name: 'Задача продукта 4' })
  await expect(window).toBeVisible()
  const key = page.url().match(/RACC-\d+$/)![0]
  await window.getByRole('button', { name: 'Действия с карточкой «Задача продукта 4»' }).click()
  expect(await menuItems(page)).toContain('Скопировать ссылку')
  await page.getByRole('menuitem', { name: 'Скопировать ссылку' }).click()
  await expect(page.getByText('Ссылка скопирована')).toBeVisible()
  const link = await copiedText(page)
  expect(link).toBe(new URL(`/cards/${key}`, page.url()).href)

  // 2. Новая вкладка, вставить ссылку: доска «Продукт» и окно этой карточки поверх неё
  const tab = await context.newPage()
  await tab.goto(link!)
  const opened = tab.getByRole('dialog', { name: 'Задача продукта 4' })
  await expect(opened).toBeVisible()
  await expect(
    tab.getByRole('heading', { name: PRODUCT, exact: true, includeHidden: true }),
  ).toBeAttached()

  // 3. Esc: окно закрылось, видна доска, адрес — адрес доски
  await tab.keyboard.press('Escape')
  await expect(opened).toBeHidden()
  await expect(tab).toHaveURL(/\/boards\/[0-9a-z]+$/)
  await expect(tab.getByRole('heading', { name: PRODUCT, exact: true })).toBeVisible()

  // «Назад» карточку снова не открывает
  await tab.goBack()
  expect(tab.url()).not.toMatch(/\/cards\//)
  await expect(tab.getByRole('dialog')).toHaveCount(0)
})
