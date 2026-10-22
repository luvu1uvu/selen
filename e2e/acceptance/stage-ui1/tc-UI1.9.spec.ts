import { expect, test, type Locator } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, tile } from './helpers'

/**
 * ТК-UI1.9: свёрнутые «Основные параметры» и «Описание» остаются свёрнутыми в другой карточке и после обновления
 * страницы; развёрнутые — с содержимым на месте. Карточки → WIN-18 «Просто карточка» и WIN-1 «Готовая
 * с комментариями» (E2eSeeder); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const toggle = (window: Locator, name: string) =>
  window.getByRole('region', { name }).getByRole('button', { name, exact: true })

async function expectCollapsed(window: Locator) {
  await expect(toggle(window, 'Основные параметры')).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle(window, 'Описание')).toHaveAttribute('aria-expanded', 'false')
  // Видны только заголовки
  await expect(window.getByText('Расположение', { exact: true })).toBeHidden()
  await expect(window.getByText('Добавьте описание…')).toBeHidden()
}

test('ТК-UI1.9. Свёрнутые секции остаются свёрнутыми @tc-UI1.9', async ({ page }) => {
  // 1. Открыть карточку, свернуть «Основные параметры» и «Описание»
  let window = await openCard(page, 'Просто карточка')
  await expect(toggle(window, 'Основные параметры')).toHaveAttribute('aria-expanded', 'true')
  await toggle(window, 'Основные параметры').click()
  await toggle(window, 'Описание').click()
  await expectCollapsed(window)

  // 2. Закрыть окно, открыть другую карточку — обе секции свёрнуты
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await tile(page, 'Готовая с комментариями').click()
  window = page.getByRole('dialog', { name: 'Готовая с комментариями' })
  await expect(window).toBeVisible()
  await expectCollapsed(window)

  // 3. Обновить страницу — так же
  await page.reload()
  await expect(window).toBeVisible()
  await expectCollapsed(window)

  // Развернуть — содержимое на месте
  await toggle(window, 'Основные параметры').click()
  await toggle(window, 'Описание').click()
  await expect(toggle(window, 'Основные параметры')).toHaveAttribute('aria-expanded', 'true')
  await expect(window.getByText('Расположение', { exact: true })).toBeVisible()
  await expect(window.getByText('Добавьте описание…')).toBeVisible()
})
