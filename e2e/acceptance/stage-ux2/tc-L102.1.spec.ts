import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { stubClipboard } from '../stage-ui1/helpers'
import { DESKTOP, openCardByKey, WINDOW_CARD } from './helpers'

/**
 * ТК-L102.1 (LATER-102): «×» уведомления поверх окна карточки закрывает уведомление, а окно остаётся. Анна → e2e-editor,
 * DEV-41 → UXB-1 «Как DEV-41» (E2eSeeder::uxBatch2). Буфер обмена подменён: стек E2E открыт не по localhost и не по
 * https — браузер буфер не даёт (тогда вместо уведомления — окно ручного копирования, ТК-L98.4).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L102.1. «×» уведомления поверх окна карточки @tc-L102.1', async ({ page }) => {
  await stubClipboard(page)

  // 1. Открыть карточку
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)

  // 2. Щёлкнуть номер под названием — справа сверху «Ссылка скопирована»
  await window.getByRole('button', { name: `${WINDOW_CARD.key}. Скопировать ссылку на карточку` }).click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Ссылка скопирована' })
  await expect(toast).toBeVisible()
  const box = (await toast.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x + box.width / 2, 'уведомление справа').toBeGreaterThan(viewport.width / 2)
  expect(box.y, 'уведомление сверху').toBeLessThan(viewport.height / 2)

  // 3. Пока уведомление видно — щёлкнуть его «×» (настоящий щелчок мышью)
  await toast.getByRole('button', { name: 'Закрыть уведомление' }).click()

  // Уведомление закрылось; окно карточки осталось, адрес — /cards/UXB-1
  await expect(toast).toHaveCount(0)
  await expect(window).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/cards/${WINDOW_CARD.key}$`))
})
