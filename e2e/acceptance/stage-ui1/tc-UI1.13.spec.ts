import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard } from './helpers'

/**
 * ТК-UI1.13: «+» → «Ссылку…» — появляется секция «Ссылки» со ссылкой, которая открывается в новой вкладке. Новая
 * карточка → WIN-7 «Для ссылки» (E2eSeeder); Анна → e2e-editor. Саму example.com тест не открывает (внешний адрес
 * из изолированного стека недоступен) — проверяет, что ссылка ведёт туда и открывается в новой вкладке.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.13. «+» → «Ссылку» @tc-UI1.13', async ({ page }) => {
  const window = await openCard(page, 'Для ссылки')
  await expect(window.getByRole('region', { name: 'Ссылки' })).toHaveCount(0)

  // 1. «+» → «Ссылку…» → адрес https://example.com, название «Пример» → «Добавить»
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Ссылку…' }).click()
  const links = window.getByRole('region', { name: 'Ссылки' })
  const url = links.getByRole('textbox', { name: 'Адрес ссылки' })
  await expect(url).toBeFocused()
  await url.fill('https://example.com')
  await links.getByRole('textbox', { name: 'Название (необязательно)' }).fill('Пример')
  await links.getByRole('button', { name: 'Добавить', exact: true }).click()

  // Секция «Ссылки» со ссылкой «Пример»; щелчок открывает её в новой вкладке
  const link = links.getByRole('link', { name: 'Пример', exact: true })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', /^https:\/\/example\.com\/?$/)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
})
