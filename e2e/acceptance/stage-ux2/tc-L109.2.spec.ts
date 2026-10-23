import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectHint, expectNoHint, moveMouseAway } from '../stage-ux1/helpers'
import { DESKTOP } from './helpers'
import { LONG_BOARD, LONG_FOLDER, openLongTree, tree } from './tree'

/**
 * ТК-L109.2 (LATER-109): полное название обрезанной строки — в подсказке и по наведению, и с клавиатуры; у короткого
 * названия подсказки нет. Длинные названия — данные E2eSeeder (./tree.ts) вместо переименования в ТК-L109.1; строка
 * «Дежурства» → «Сквозные тесты» (короткое название); Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L109.2. Полное название обрезанной строки — в подсказке @tc-L109.2', async ({ page }) => {
  const { folder, board } = await openLongTree(page)

  // 1. Навести указатель на строку доски с длинным названием — подсказка с полным названием
  await board.hover()
  await expectHint(page, LONG_BOARD)
  await moveMouseAway(page)

  // 2. Щёлкнуть в «Найти…» и нажимать Tab, пока фокус не встанет на строку папки — подсказка с полным названием
  await page.getByRole('searchbox', { name: 'Поиск по дереву' }).click()
  for (let i = 0; i < 150 && !(await folder.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(folder).toBeFocused()
  await expectHint(page, LONG_FOLDER)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

  // 3. Навести указатель на строку с коротким названием — подсказки нет
  await moveMouseAway(page)
  await tree(page).getByRole('link', { name: 'Сквозные тесты', exact: true }).hover()
  await expectNoHint(page, 'Сквозные тесты')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})
