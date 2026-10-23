import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { EMPTY_FOLDER_HINT, treeFolder } from '../stage-3/helpers'
import { expectHint } from '../stage-ux1/helpers'
import { DESKTOP } from './helpers'
import { tree } from './tree'

/**
 * ТК-L88.2 (LATER-88): пометка «пустая» у пустой папки — при наведении видна левее «+» и «⋯» строки, над ней —
 * подсказка. «Новые направления» → «E2E Пустая» (E2eSeeder; видна только Владельцу); Владелец → e2e-owner.
 */
test.use({ storageState: authFile('e2e-owner@selen.test'), viewport: DESKTOP })

const FOLDER = 'E2E Пустая'

test('ТК-L88.2. «пустая» у пустой папки — подсказка мышью @tc-L88.2', async ({ page }) => {
  // 1. Папка с серой пометкой «пустая»
  await page.goto('/')
  const row = treeFolder(page, FOLDER)
  await expect(row).toBeVisible()
  const empty = tree(page)
    .getByText('пустая', { exact: true })
    .filter({ visible: true })
    .first()
  // Пометка — в строке этой папки
  const rowBox = (await row.boundingBox())!
  const emptyBox0 = (await empty.boundingBox())!
  expect(emptyBox0.y).toBeGreaterThanOrEqual(rowBox.y)
  expect(emptyBox0.y + emptyBox0.height).toBeLessThanOrEqual(rowBox.y + rowBox.height)

  // 2. Навести указатель на «пустая»: появились «+» и «⋯», пометка видна левее них
  await empty.hover()
  const add = tree(page).getByRole('button', { name: `Добавить в «${FOLDER}»` })
  const menu = tree(page).getByRole('button', { name: `Меню «${FOLDER}»` })
  await expect
    .poll(() => add.evaluate((e) => getComputedStyle(e.parentElement!).opacity), { message: '«+» и «⋯» видны' })
    .toBe('1')
  await expect(add).toBeVisible()
  await expect(menu).toBeVisible()
  await expect(empty).toBeVisible()
  const emptyBox = (await empty.boundingBox())!
  const addBox = (await add.boundingBox())!
  expect(emptyBox.x + emptyBox.width, '«пустая» — левее «+»').toBeLessThanOrEqual(addBox.x)

  // Над «пустая» — подсказка
  await expectHint(page, EMPTY_FOLDER_HINT)
})
