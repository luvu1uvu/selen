import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey, WINDOW_CARD } from './helpers'

/**
 * ТК-L98.5 (U-8): кнопки добавления — внизу секций, с глаголом: «+ Добавить чек-лист» под чек-листами, «Приложить
 * файл» под файлами (над файлами кнопки нет); значки кнопок — вровень с левым краем содержимого секции. Анна →
 * e2e-editor, DEV-41 → UXB-1 «Как DEV-41» — с чек-листом «Перед релизом» и файлом (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.5. Кнопки добавления внизу секций @tc-L98.5', async ({ page }) => {
  // 1. Низ секций «Чек-листы» и «Файлы»
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)

  const checklists = window.getByRole('region', { name: 'Чек-листы' })
  const checklist = checklists.getByRole('button', { name: 'Переименовать чек-лист: Перед релизом' })
  const addChecklist = checklists.getByRole('button', { name: 'Добавить чек-лист', exact: true })
  await expect(addChecklist).toHaveCount(1)
  await addChecklist.scrollIntoViewIfNeeded()
  await expect(addChecklist).toBeVisible()
  const lastItem = checklists.getByText('Проверить миграции', { exact: true }).first()
  expect((await addChecklist.boundingBox())!.y, '«Добавить чек-лист» — под чек-листом').toBeGreaterThan(
    (await lastItem.boundingBox())!.y,
  )
  const checklistIcon = (await addChecklist.locator('svg').boundingBox())!
  expect(Math.abs(checklistIcon.x - (await checklist.boundingBox())!.x), 'значок «+» вровень с содержимым').toBeLessThanOrEqual(2)

  const files = window.getByRole('region', { name: 'Файлы' })
  const attach = files.getByRole('button', { name: 'Приложить файл', exact: true })
  await expect(attach).toHaveCount(1)
  await attach.scrollIntoViewIfNeeded()
  await expect(attach).toBeVisible()
  const preview = files.getByRole('button', { name: 'Открыть «скриншот-41.png»' })
  const previewBox = (await preview.boundingBox())!
  expect((await attach.boundingBox())!.y, '«Приложить файл» — под файлами, над ними кнопки нет').toBeGreaterThan(
    previewBox.y + previewBox.height,
  )
  const attachIcon = (await attach.locator('svg').boundingBox())!
  expect(Math.abs(attachIcon.x - previewBox.x), 'значок вровень с содержимым').toBeLessThanOrEqual(2)
})
