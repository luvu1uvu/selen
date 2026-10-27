import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey } from '../stage-ux2/helpers'

/**
 * ТК-L112.3 (решение PM 27.10, U-5 UX-ревью пачки UX-3): блокировка только причиной называется «Заблокирована» — и на
 * плашке, и в ленте «Истории» (было «Карточка заблокирована»). Анна → e2e-editor; DEV-171 → UXC-5 «Заблокированная»
 * (E2eSeeder::uxBatch3: заблокирована причиной «Ждём доступ к стенду»). Только смотрим.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L112.3. Блокировка только причиной называется «Заблокирована» @tc-L112.3', async ({ page }) => {
  // 1. Карточка с плашкой «Заблокирована» без блокирующей карточки
  const window = await openCardByKey(page, 'UXC-5', 'Заблокированная')

  // 2. Плашка: «Заблокирована» и причина
  const banner = window
    .locator('div')
    .filter({ hasText: 'Ждём доступ к стенду' })
    .filter({ has: page.getByRole('button', { name: 'Снять блокировку' }) })
    .last()
  await expect(banner).toBeVisible()
  expect((await banner.innerText()).split('\n')[0].trim(), 'заголовок плашки').toBe('Заблокирована')

  // Лента «Истории»: запись о блокировке — «Заблокирована» и та же причина строкой ниже
  await window.getByRole('tab', { name: 'История' }).click()
  const history = window.getByRole('tabpanel', { name: 'История' }).getByRole('list', { name: 'История' })
  const blocked = history.getByRole('listitem').filter({ hasText: 'Ждём доступ к стенду' })
  await expect(blocked).toHaveCount(1)
  const lines = (await blocked.innerText()).split('\n').map((line) => line.trim())
  expect(lines[0], 'первая строка записи').toBe('Заблокирована')
  expect(lines[1], 'причина').toBe('Ждём доступ к стенду')
  await expect(history).not.toContainText('Карточка заблокирована')
})
