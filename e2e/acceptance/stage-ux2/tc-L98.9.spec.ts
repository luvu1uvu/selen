import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey } from './helpers'

/**
 * ТК-L98.9 (U-17): подсказка у нового комментария — «Ctrl+Enter — отправить, @ — упомянуть»; в «Истории» поле
 * называется «План, ч» (не «Оценка»), названия полей — с заглавной. Анна → e2e-editor; DEV-231 после ТК-L98.1 →
 * UXB-4 «История плана», у которой план 3 задан и стёрт ещё в данных (E2eSeeder::uxBatch2) — тест-кейс не зависит
 * от прогона ТК-L98.1.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.9. Тексты: «Ctrl+Enter — отправить» и «План, ч» в истории @tc-L98.9', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-4', 'История плана')

  // 1. Вкладка «Комментарии» — подсказка справа от «Отправить»
  await window.getByRole('tab', { name: 'Комментарии' }).click()
  const hint = window.getByText('Ctrl+Enter — отправить, @ — упомянуть', { exact: true })
  await expect(hint).toBeVisible()
  const send = window.getByRole('button', { name: 'Отправить' })
  const sendBox = (await send.boundingBox())!
  const hintBox = (await hint.boundingBox())!
  expect(hintBox.x, 'подсказка — справа от «Отправить»').toBeGreaterThan(sendBox.x)

  // 2. Вкладка «История» — «План, ч: — → 3» и «План, ч: 3 → —», не «Оценка»
  await window.getByRole('tab', { name: 'История' }).click()
  const history = window.getByRole('tabpanel', { name: 'История' })
  await expect(history.getByText('План, ч: — → 3', { exact: true })).toBeVisible()
  await expect(history.getByText('План, ч: 3 → —', { exact: true })).toBeVisible()
  await expect(history).not.toContainText('Оценка')
  await expect(history).not.toContainText('план, ч')
})
