import { test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { laneRow, openLanesBoard } from '../stage-layout/helpers'
import { DESKTOP, expectHint, moveMouseAway, tabTo } from './helpers'

/**
 * ТК-L75.1 (LATER-75): у «⋯» колонки и дорожки — подсказка «Действия с колонкой «Backlog»» / «Действия с дорожкой
 * «Основная»» и при наведении, и при фокусе Tab. «Продукт» → «Дорожки приёмки» (LAYOUT, E2eSeeder: дорожки «Основная»,
 * «Срочные», «Плановые»), Анна → e2e-admin. Доску только смотрим (дорожки разворачивает openLanesBoard).
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L75.1. «⋯» колонки и дорожки — с подсказкой @tc-L75.1', async ({ page }) => {
  // 1. Открыть доску
  await openLanesBoard(page)
  const column = page.getByRole('button', { name: 'Действия с колонкой «Backlog»' })
  const lane = laneRow(page, 'Основная').getByRole('button', { name: 'Действия с дорожкой «Основная»' })

  // 2. Наведение
  await column.hover()
  await expectHint(page, 'Действия с колонкой «Backlog»')
  await moveMouseAway(page)
  await lane.hover()
  await expectHint(page, 'Действия с дорожкой «Основная»')

  // 3. Клавишей Tab
  await tabTo(page, column)
  await expectHint(page, 'Действия с колонкой «Backlog»')
  await tabTo(page, lane)
  await expectHint(page, 'Действия с дорожкой «Основная»')
})
