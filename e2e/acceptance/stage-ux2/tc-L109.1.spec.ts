import { expect, test, type Locator } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP } from './helpers'
import { LONG_BOARD, LONG_FOLDER, openLongTree, tree } from './tree'

/**
 * ТК-L109.1 (LATER-109): длинные названия папки и доски — в одну строку той же высоты, с «…»; значки папки, доски и
 * стрелки раскрытия видны; у дерева нет прокрутки вбок, вбок оно не прокручивается. Переименование «Продуктовых
 * команд» и доски «Продукт» заменено данными E2eSeeder с длинными названиями (./tree.ts); Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

/** Название в строке обрезано «…», а сама строка не выходит за дерево. */
async function expectEllipsis(row: Locator, name: string) {
  const text = row.getByText(name, { exact: true })
  const style = await text.evaluate((e) => ({
    scroll: e.scrollWidth,
    client: e.clientWidth,
    overflow: getComputedStyle(e).textOverflow,
    wrap: getComputedStyle(e).whiteSpace,
  }))
  expect(style.scroll, `«${name}» обрезано`).toBeGreaterThan(style.client)
  expect(style.overflow).toBe('ellipsis')
  expect(style.wrap).toBe('nowrap')
}

test('ТК-L109.1. Длинные названия в дереве — «…», без прокрутки вбок @tc-L109.1', async ({ page }) => {
  // 1–2. Папка и доска с длинными названиями, папки и пространство раскрыты
  const { folder, board } = await openLongTree(page)
  const nav = tree(page)
  const short = nav.getByRole('link', { name: 'Сквозные тесты', exact: true })

  // 3. Строки — в одну строку той же высоты, что и короткие, названия обрезаны «…»
  const height = (await short.boundingBox())!.height
  const navBox = (await nav.boundingBox())!
  for (const [row, name] of [
    [folder, LONG_FOLDER],
    [board, LONG_BOARD],
  ] as const) {
    await expectEllipsis(row, name)
    const box = (await row.boundingBox())!
    expect(box.height, `«${name}»: высота строки`).toBe(height)
    expect(box.x + box.width, `«${name}»: строка в пределах дерева`).toBeLessThanOrEqual(navBox.x + navBox.width + 0.5)
  }
  // Значки видны: стрелка раскрытия и значок папки, значок доски — в пределах своей строки
  for (const row of [folder, board]) {
    const rowBox = (await row.boundingBox())!
    const icons = row.locator('svg')
    expect(await icons.count()).toBeGreaterThan(0)
    for (const icon of await icons.all()) {
      const box = (await icon.boundingBox())!
      expect(box.width).toBeGreaterThan(8)
      expect(box.x).toBeGreaterThanOrEqual(rowBox.x)
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    }
  }

  // У дерева и у панели вокруг него нет прокрутки вбок
  const scrollable = () =>
    nav.evaluate((element) => {
      const result: { scroll: number; client: number; left: number }[] = []
      for (let e: Element | null = element; e && e !== document.body; e = e.parentElement) {
        result.push({ scroll: e.scrollWidth, client: e.clientWidth, left: e.scrollLeft })
      }
      return result
    })
  for (const box of await scrollable()) expect(box.scroll).toBeLessThanOrEqual(box.client)

  // Попробовать прокрутить вбок (колесо / тачпад вбок над деревом): ничего не сдвигается
  await board.hover()
  await page.mouse.wheel(300, 0)
  await page.keyboard.down('Shift')
  await page.mouse.wheel(0, 300)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(200)
  for (const box of await scrollable()) expect(box.left, 'дерево не прокрутилось вбок').toBe(0)
})
