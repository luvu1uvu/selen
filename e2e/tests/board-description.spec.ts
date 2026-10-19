import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome } from './helpers'

/**
 * Описание доски (LATER-64): задаётся в окне «Новая доска», меняется и стирается через «⋯» доски; значок ⓘ в шапке —
 * только когда описание есть. Пространство «Раскладка» (E2eSeeder), e2e-admin — его администратор.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

async function createBoard(page: Page, name: string, description: string) {
  await page.goto('/spaces/LAYOUT')
  await page.getByRole('tab', { name: 'Доски' }).click()
  await page.getByRole('button', { name: 'Создать доску' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая доска' })
  await dialog.getByLabel('Название').fill(name)
  await dialog.getByLabel('Описание').fill(description)
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

const info = (page: Page) => page.getByRole('button', { name: 'Описание доски' })

async function editDescription(page: Page, description: string) {
  await page.getByRole('button', { name: 'Действия с доской' }).click()
  await page.getByRole('menuitem', { name: 'Изменить описание' }).click()
  const dialog = page.getByRole('dialog', { name: 'Описание доски' })
  await dialog.getByLabel('Описание').fill(description)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()
}

test('доска без описания и с описанием из пробелов — значка ⓘ нет', async ({ page }) => {
  await openHome(page)
  await createBoard(page, 'Без правил', '   ')
  await expect(info(page)).toHaveCount(0)
})

test('описание: задать при создании, изменить и стереть через «⋯» — ⓘ появляется и пропадает', async ({ page }) => {
  await openHome(page)
  await createBoard(page, 'Доска с правилами', 'Как завести баг:\nшаги и ожидаемый результат')

  await info(page).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'Как завести баг:' })).toContainText('шаги и ожидаемый результат')
  await page.keyboard.press('Escape')

  await editDescription(page, 'Новые правила')
  await info(page).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'Новые правила' })).toBeVisible()
  await page.keyboard.press('Escape')

  await editDescription(page, '')
  await expect(info(page)).toHaveCount(0)
  // После перезагрузки — так же: описание стёрто на сервере
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Доска с правилами' })).toBeVisible()
  await expect(info(page)).toHaveCount(0)
})
