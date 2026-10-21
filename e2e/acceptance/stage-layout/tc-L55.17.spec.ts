import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, DUTY, INFRA, loaded, openSpace, PRODUCT, scrollToBoard, WIDE } from './rows'

/**
 * ТК-L55.17 (LATER-55): раскладку меняет только администратор пространства. У участника без прав администратора
 * (editor) нет ручки ⠿ слева от названий досок, но есть стрелка свернуть ˄; в меню «⋯» — «Архив карточек», но нет
 * «Переставить» и «Архивировать доску…»; над панелью нет «Создать доску». «Разработка» демо-данных → RACC «Ряды
 * приёмки» (E2eSeeder), Борис → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L55.17. У участника без прав администратора нет ручки и перестановки @tc-L55.17', async ({ page }) => {
  // 1. Открыть пространство, посмотреть на шапки досок
  await openSpace(page, 'RACC', 'Приёмка рядов')
  await loaded(page, DUTY)
  await scrollToBoard(page, PRODUCT, 16)
  await loaded(page, PRODUCT)
  for (const name of [DUTY, WIDE, PRODUCT, INFRA]) {
    const header = block(page, name).locator('header').first()
    await expect(header.getByRole('heading', { name, exact: true })).toBeAttached()
    await expect(header.getByRole('button', { name: `Свернуть доску «${name}»` })).toBeAttached()
  }
  // Значка ⠿ нет ни у одной доски
  await expect(page.locator('[data-board-handle]')).toHaveCount(0)
  // Над панелью нет «Создать доску»; «Архив досок» — есть
  await expect(page.getByRole('button', { name: 'Создать доску', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Архив досок', exact: true })).toBeVisible()

  // 2. Нажать «⋯» в шапке «Продукт»: «Архив карточек» есть, «Переставить» и «Архивировать доску…» — нет
  await block(page, PRODUCT).getByRole('button', { name: `Действия с доской «${PRODUCT}»` }).click()
  await expect(page.getByRole('menuitem', { name: 'Архив карточек' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Переставить' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: /Архивировать доску/ })).toHaveCount(0)
})
