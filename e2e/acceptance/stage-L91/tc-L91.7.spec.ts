import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { tree, treeFolder } from '../stage-3/helpers'
import { COLORS, colorsOf, contrast, expectColor, hex, token } from './helpers'

/**
 * ТК-L91.7 (LATER-91): пустая папка в дереве (видна только Владельцу) читается — название серое, как вторичный текст
 * (muted-foreground #636363 без прозрачности; было muted-foreground / 70 % — 2,7:1), не меньше 4,5:1 к фону панели,
 * того же цвета, что остальные невыбранные строки дерева, — не бледнее их. «Новые направления» → пустая папка
 * E2eSeeder «E2E Пустая», Владелец — e2e-owner. У e2e-owner в дереве только пустые папки (он не участвует ни в одном
 * пространстве, ТК-3.30), поэтому «остальные строки» — дерево e2e-admin: папка «E2E Мобильные» и пространство
 * «Сквозные тесты» (та же строка дерева, NavTree).
 *
 * Исправление теста (LATER-106): тест-кейс ждал «остальные строки дерева — чёрные», но невыбранные строки дерева
 * серые (muted-foreground) и на main — неверен был ожидаемый результат, а не код. На main тест падает на проверке
 * «без прозрачности» (muted-foreground / 70 %).
 */
test('ТК-L91.7. Пустая папка в дереве читается @tc-L91.7', async ({ browser }) => {
  // 1. Владелец: папка «E2E Пустая» — серая, без прозрачности, читается
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  const folder = treeFolder(owner, 'E2E Пустая')
  await expect(folder).toBeVisible()
  const name = folder.getByText('E2E Пустая', { exact: true })
  const row = await colorsOf(folder)
  const text = await colorsOf(name)
  expect(row.opacity, 'строка папки без прозрачности').toBe(1)
  expect(text.opacity, 'название без прозрачности').toBe(1)
  expect(text.text.a, 'цвет названия без прозрачности').toBe(1)
  expectColor(text.text, COLORS.muted, 'название пустой папки — вторичный текст')
  expectColor(await token(owner, 'muted-foreground'), COLORS.muted, 'токен muted-foreground')
  const panel = await token(owner, 'sidebar')
  expect(contrast(text.text, panel), `название к панели дерева ${hex(panel)}`).toBeGreaterThanOrEqual(4.5)
  expect(contrast(text.text, text.under), 'название к фону строки').toBeGreaterThanOrEqual(4.5)

  // Остальные невыбранные строки дерева — того же цвета (на главной ни одна строка не выбрана): пустая папка не бледнее
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  for (const other of ['E2E Мобильные', 'Сквозные тесты']) {
    const label = tree(admin).getByText(other, { exact: true })
    await expect(label).toBeVisible()
    expectColor((await colorsOf(label)).text, hex(text.text), `строка дерева «${other}» — как пустая папка`)
  }
})
