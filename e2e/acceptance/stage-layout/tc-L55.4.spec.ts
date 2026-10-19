import { expect, test } from '@playwright/test'
import { authFile, openBoard, pageAs } from '../../tests/helpers'
import { cell, expandAllLanes, LAPTOP, LANES_BOARD, openLanesBoard, toggle } from './helpers'

/**
 * ТК-L55.4 (LATER-55, шаг 2): сворачивание личное. Анна сворачивает «Срочные» — у Бориса во втором браузере они
 * развёрнуты, карточки видны; у Анны после обновления «Срочные» свёрнуты. Анна → e2e-editor, Борис → e2e-admin
 * (участник «Раскладки»; второй браузер — отдельный контекст со своим входом). «Продукт» → «Дорожки приёмки».
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

const URGENT_CARDS = /: Приёмочная срочная/

test('ТК-L55.4. У другого пользователя дорожка развёрнута @tc-L55.4', async ({ page, browser }) => {
  // Предусловие: у Бориса на доске ничего не свёрнуто
  const boris = await pageAs(browser, 'e2e-admin@selen.test')
  await boris.setViewportSize(LAPTOP)
  await openBoard(boris, 'Раскладка', LANES_BOARD)
  await expandAllLanes(boris)

  // 1. У Анны свернуть «Срочные»
  await openLanesBoard(page)
  await toggle(page, 'Срочные', 'Свернуть').click()
  await expect(toggle(page, 'Срочные', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: URGENT_CARDS })).toHaveCount(0)

  // 2. Во втором браузере Борис открывает доску — «Срочные» развёрнуты, карточки видны
  await boris.reload()
  await expect(boris.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(toggle(boris, 'Срочные', 'Свернуть')).toHaveAttribute('aria-expanded', 'true')
  await expect(cell(boris, 'To Do / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(2)
  await expect(cell(boris, 'In Progress / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(1)
  await expect(boris.getByRole('button', { name: URGENT_CARDS }).first()).toBeVisible()
  await boris.context().close()

  // 3. У Анны обновить страницу — «Срочные» свёрнуты; затем развернуть
  await page.reload()
  await expect(page.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(toggle(page, 'Срочные', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: URGENT_CARDS })).toHaveCount(0)
  await toggle(page, 'Срочные', 'Развернуть').click()
  await expect(cell(page, 'To Do / Срочные').getByRole('button', { name: URGENT_CARDS })).toHaveCount(2)
})
