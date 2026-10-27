import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey } from '../stage-ux2/helpers'

/**
 * ТК-L112.2 (LATER-112): лента «Истории» называет блокировку карточкой теми же словами, что плашка, — «Заблокирована
 * карточкой …», без «Блокирует: …» и без отдельной строки «Карточка заблокирована». Анна → e2e-editor; DEV-231 → UXC-3
 * «Как DEV-231», DEV-230 → UXC-2 «Блокирующая» (E2eSeeder::uxBatch3; тест блокирует UXC-3).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L112.2. Лента «Истории» называет блокировку так же, как плашка @tc-L112.2', async ({ page }) => {
  const window = await openCardByKey(page, 'UXC-3', 'Как DEV-231')

  // 1. «+» → «Остальное» → «Блокировка» → «Выбрать блокирующую карточку» → UXC-2 → «Заблокировать»
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Блокировка' }).click()
  const form = window.getByRole('form', { name: 'Новая блокировка' })
  await form.getByRole('button', { name: 'Выбрать блокирующую карточку' }).click()
  await form.getByRole('textbox', { name: 'Найти блокирующую карточку' }).fill('UXC-2')
  await form.getByRole('list').getByRole('button').filter({ hasText: 'UXC-2' }).filter({ hasText: 'Блокирующая' }).click()
  await form.getByRole('button', { name: 'Заблокировать' }).click()
  await expect(form).toHaveCount(0)

  // 2. Плашка под рядом действий: «Заблокирована карточкой UXC-2 Блокирующая»
  const banner = window
    .locator('div')
    .filter({ hasText: 'Заблокирована карточкой' })
    .filter({ has: page.getByRole('button', { name: 'Снять блокировку' }) })
    .last()
  await expect(banner).toBeVisible()
  expect((await banner.innerText()).split('\n')[0].trim(), 'заголовок плашки').toBe('Заблокирована карточкой')
  await expect(banner.getByRole('link', { name: 'UXC-2' })).toBeVisible()
  await expect(banner).toContainText('Блокирующая')

  // 3. Внизу окна — вкладка «История»: верхняя запись — те же слова, что на плашке, с номером и названием
  await window.getByRole('tab', { name: 'История' }).click()
  const history = window.getByRole('tabpanel', { name: 'История' }).getByRole('list', { name: 'История' })
  const top = history.getByRole('listitem').first()
  await expect(top).toContainText('Заблокирована карточкой UXC-2 «Блокирующая»')
  expect((await top.innerText()).split('\n')[0].trim(), 'первая строка верхней записи').toBe(
    'Заблокирована карточкой UXC-2 «Блокирующая»',
  )
  // Без слов «Блокирует:» и без отдельной строки «Карточка заблокирована» — ни в этой записи, ни в ленте
  await expect(history).not.toContainText('Блокирует:')
  await expect(history).not.toContainText('Карточка заблокирована')
})
