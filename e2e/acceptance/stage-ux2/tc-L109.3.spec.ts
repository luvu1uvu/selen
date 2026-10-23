import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP } from './helpers'
import { LONG_FOLDER, openLongTree, tree } from './tree'

/**
 * ТК-L109.3 (LATER-109): у строки папки с длинным названием «+» и «⋯» — у правого края строки поверх конца названия
 * (текст под ними закрыт фоном строки), видны целиком и открывают свои меню. Длинное название — данные E2eSeeder
 * (./tree.ts) вместо переименования в ТК-L109.1; Анна → e2e-admin (администратор Selen — меню папки).
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L109.3. «+» и «⋯» — поверх конца длинного названия @tc-L109.3', async ({ page }) => {
  const { folder } = await openLongTree(page)
  const nav = tree(page)
  const add = nav.getByRole('button', { name: `Добавить в «${LONG_FOLDER}»` })
  const menu = nav.getByRole('button', { name: `Меню «${LONG_FOLDER}»` })

  // 1. Навести указатель на строку папки: «+» и «⋯» у правого края, поверх конца названия, видны целиком
  await folder.hover()
  const row = (await folder.boundingBox())!
  const name = (await folder.getByText(LONG_FOLDER, { exact: true }).boundingBox())!
  const navBox = (await nav.boundingBox())!
  for (const [what, button] of [
    ['«+»', add],
    ['«⋯»', menu],
  ] as const) {
    await expect(button).toBeVisible()
    // Видимость кнопок задаёт их общая подложка (opacity 0 → 1 при наведении на строку)
    await expect
      .poll(() => button.evaluate((e) => getComputedStyle(e.parentElement!).opacity), { message: `${what} видна` })
      .toBe('1')
    const box = (await button.boundingBox())!
    expect(box.x, `${what} — поверх названия`).toBeLessThan(name.x + name.width)
    expect(box.x + box.width, `${what} — в пределах строки`).toBeLessThanOrEqual(row.x + row.width + 0.5)
    expect(box.x + box.width, `${what} — в пределах дерева`).toBeLessThanOrEqual(navBox.x + navBox.width)
    expect(box.y).toBeGreaterThanOrEqual(row.y)
    expect(box.y + box.height).toBeLessThanOrEqual(row.y + row.height)
  }
  // Текст под кнопками закрыт непрозрачным фоном
  const cover = await add.evaluate((e) => {
    for (let p: Element | null = e.parentElement; p; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
    }
    return null
  })
  expect(cover, 'у кнопок — фон строки').not.toBeNull()

  // 2. «⋯» — меню папки; Esc; «+» — что добавить
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Изменить иконку' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await folder.hover()
  await add.click()
  await expect(page.getByRole('menuitem', { name: 'Папку' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Пространство' })).toBeVisible()
  await page.keyboard.press('Escape')
})
