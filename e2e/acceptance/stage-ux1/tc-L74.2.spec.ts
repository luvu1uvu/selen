import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { DESKTOP } from './helpers'

/**
 * ТК-L74.2 (LATER-74, решение PM 20.10): на панели пространства «Архив досок» и «Создать доску» — сразу за вкладками
 * и только на вкладке «Доски»; «Изменить» — у правого края, между ними пусто. «Разработка» → RACC «Приёмка рядов»
 * (E2eSeeder, устроено как «Разработка»), Анна → e2e-admin (администратор пространства). Только смотрим.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

const SPACE = 'Приёмка рядов'

test('ТК-L74.2. «Архив досок» и «Создать доску» — за вкладками и только на «Досках» @tc-L74.2', async ({ page }) => {
  // 1. Дерево → пространство
  await openHome(page)
  await page
    .getByRole('navigation', { name: 'Дерево' })
    .getByRole('link', { name: new RegExp(`^${SPACE}`) })
    .click()
  await expect(page.getByRole('heading', { name: SPACE, level: 1 })).toBeVisible()

  // 2. Панель над досками
  const tabs = page.getByRole('tablist').first()
  const archive = page.getByRole('button', { name: 'Архив досок', exact: true })
  const create = page.getByRole('button', { name: 'Создать доску', exact: true })
  const edit = page.getByRole('button', { name: 'Изменить', exact: true })
  const main = (await page.locator('main').boundingBox())!
  const [t, a, c, e] = await Promise.all([tabs, archive, create, edit].map(async (l) => (await l.boundingBox())!))
  // Одна строка
  for (const box of [a, c, e]) expect(Math.abs(box.y + box.height / 2 - (t.y + t.height / 2))).toBeLessThanOrEqual(2)
  // Сразу за вкладками — «Архив досок», за ним — «Создать доску»
  expect(a.x - (t.x + t.width)).toBeGreaterThanOrEqual(0)
  expect(a.x - (t.x + t.width)).toBeLessThanOrEqual(17)
  expect(c.x - (a.x + a.width)).toBeGreaterThanOrEqual(0)
  expect(c.x - (a.x + a.width)).toBeLessThanOrEqual(9)
  // «Изменить» — у правого края панели, между ним и «Создать доску» пусто
  expect(main.x + main.width - (e.x + e.width)).toBeLessThanOrEqual(17)
  expect(e.x - (c.x + c.width)).toBeGreaterThan(48)
  const between = await page.evaluate(
    ({ from, to, y }) => {
      const hits = []
      for (let x = from + 4; x < to - 4; x += 8) {
        const hit = document.elementFromPoint(x, y)
        if (hit?.closest('button, a, [role="tab"], input')) hits.push(hit.textContent)
      }
      return hits
    },
    { from: c.x + c.width, to: e.x, y: e.y + e.height / 2 },
  )
  expect(between).toEqual([])

  // 3. «Участники», затем «Метки»: кнопок «Архив досок» и «Создать доску» нет, «Изменить» на месте
  for (const tab of ['Участники', 'Метки']) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    await expect(archive).toHaveCount(0)
    await expect(create).toHaveCount(0)
    await expect(edit).toBeVisible()
    expect(Math.abs((await edit.boundingBox())!.x - e.x)).toBeLessThanOrEqual(1)
  }
})
