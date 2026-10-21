import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard } from './helpers'

/**
 * ТК-UI1.14: «+» → «Дочернюю карточку…» — в секции «Связи» дочерние с номерами и полоса «Готово дочерних: 1 из 2»;
 * щелчок по номеру дочерней открывает её окно, «Назад» возвращает к родителю. Новая карточка → WIN-8 «Для связей»,
 * карточка из Done → WIN-10 «Дочерняя готовая», из To Do → WIN-9 «Дочерняя в To Do» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

async function addChild(page: Page, window: Locator, title: string) {
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Дочернюю карточку…' }).click()
  const search = window.getByRole('textbox', { name: 'Найти дочернюю карточку' })
  await expect(search).toBeFocused()
  await search.fill(title)
  await window
    .getByRole('region', { name: 'Связи' })
    .getByRole('button', { name: new RegExp(title) })
    .click()
  await expect(page.getByText('Связь добавлена').last()).toBeVisible()
}

test('ТК-UI1.14. «+» → «Дочернюю карточку» и прогресс @tc-UI1.14', async ({ page }) => {
  const window = await openCard(page, 'Для связей')
  const parentUrl = page.url()

  // 1. «+» → «Дочернюю карточку…» → карточка из Done; 2. ещё раз — из To Do
  await addChild(page, window, 'Дочерняя готовая')
  await addChild(page, window, 'Дочерняя в To Do')

  // «Связи»: «Дочерние» — две карточки с номерами; «Готово дочерних: 1 из 2»
  const relations = window.getByRole('region', { name: 'Связи' })
  await expect(relations.getByText('Дочерние', { exact: true })).toBeVisible()
  await expect(relations.getByRole('link', { name: /^WIN-\d+$/ })).toHaveCount(2)
  await expect(relations.getByText('Готово дочерних: 1 из 2')).toBeVisible()

  // Щелчок по номеру дочерней открывает её окно; «Назад» возвращает к родителю
  const child = relations
    .getByRole('listitem')
    .filter({ hasText: 'Дочерняя в To Do' })
    .getByRole('link')
  const childKey = (await child.textContent())!
  await child.click()
  await expect(page).toHaveURL(new RegExp(`/cards/${childKey}$`))
  await expect(page.getByRole('dialog', { name: 'Дочерняя в To Do' })).toBeVisible()
  await page.goBack()
  expect(page.url()).toBe(parentUrl)
  await expect(page.getByRole('dialog', { name: 'Для связей' })).toBeVisible()
})
