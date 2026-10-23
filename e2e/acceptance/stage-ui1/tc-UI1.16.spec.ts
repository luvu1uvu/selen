import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { menuItems, openCard, param, tile } from './helpers'

/**
 * ТК-UI1.16: действия с карточкой — в меню «⋯»: «Переместить…», «Архивировать», «Скопировать ссылку», без «Удалить…»
 * (не системный администратор). Архивировать — плашка «Карточка в архиве», поля не правятся, «+» нет, на доске
 * карточки нет; «⋯» → «Вернуть из архива» — карточка снова на доске, поля правятся. Карточка → WIN-12 «Архивируется
 * и возвращается» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const TITLE = 'Архивируется и возвращается'

test('ТК-UI1.16. «⋯»: архивировать и вернуть @tc-UI1.16', async ({ page }) => {
  const window = await openCard(page, TITLE)
  const actions = window.getByRole('button', { name: `Действия с карточкой «${TITLE}»` })

  // 1. «⋯»: «Переместить…», «Архивировать», «Скопировать ссылку»; «Удалить…» нет
  await actions.click()
  expect(await menuItems(page)).toEqual(['Переместить…', 'Архивировать', 'Скопировать ссылку'])

  // 2. «Архивировать»: плашка «Карточка в архиве», поля не правятся, «+» нет; карточки нет на доске
  await page.getByRole('menuitem', { name: 'Архивировать' }).click()
  await expect(page.getByText('Карточка архивирована')).toBeVisible()
  await expect(window.getByText('Карточка в архиве', { exact: true })).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
  await expect(window.getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Добавить в карточку' })).toHaveCount(0)
  const main = window.getByRole('region', { name: 'Основные параметры' })
  await expect(main.getByRole('button', { name: 'Переместить…' })).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Назначить' })).toHaveCount(0)
  // Пачка UX-2 (решение PM 22.10): «Срочно» без права правки — текстом «Да» / «Нет», а не недоступным флажком (V-5)
  await expect(main.getByRole('checkbox', { name: 'Срочно' })).toHaveCount(0)
  await expect(param(main, 'Срочно')).toHaveText('Нет')
  await expect(tile(page, TITLE)).toHaveCount(0)

  // 3. «⋯» → «Вернуть из архива»: карточка снова на доске, поля правятся
  await actions.click()
  await page.getByRole('menuitem', { name: 'Вернуть из архива' }).click()
  await expect(page.getByText('Карточка восстановлена')).toBeVisible()
  await expect(window.getByText('Карточка в архиве', { exact: true })).toHaveCount(0)
  await expect(window.getByRole('textbox', { name: 'Название' })).toBeEditable()
  await expect(window.getByRole('button', { name: 'Добавить в карточку' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Назначить' })).toBeVisible()
  await expect(main.getByRole('checkbox', { name: 'Срочно' })).toBeEnabled()
  await expect(tile(page, TITLE)).toHaveCount(1)
})
