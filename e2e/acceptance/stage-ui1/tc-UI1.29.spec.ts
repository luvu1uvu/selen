import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard } from './helpers'

/**
 * ТК-UI1.29 (решение PM 22.10): время комментария — относительное («N минут назад», «только что»), точная дата —
 * в подсказке. Анна → e2e-editor, карточка WIN «Готовая с комментариями» (два комментария, E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.29. Время комментариев — относительное @tc-UI1.29', async ({ page }) => {
  const window = await openCard(page, 'Готовая с комментариями')
  const comments = window.getByRole('tabpanel', { name: 'Комментарии' })
  const first = comments.getByRole('listitem').first()
  await expect(first).toContainText('Первый комментарий')

  // Время — относительное, без даты с годом
  const time = first.locator('time')
  await expect(time).toHaveText(/только что|назад/)
  await expect(time).not.toHaveText(/\d{4}/)

  // Точная дата — в подсказке по наведению
  await time.hover()
  await expect(page.getByRole('tooltip')).toHaveText(/\d{4} г\., \d{1,2}:\d{2}/)
})
