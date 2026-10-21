import { expect, test, type Locator } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'

/**
 * ТК-L74.8 (LATER-74, ответ PM 21.10 на вопрос 2 по PR #16): узкий вид панели пространства («⋯» вместо кнопок) включается
 * по ширине самой панели, а не окна. Окно 1024 px с открытым деревом — панель уже 896 px: одна строка «Название · ключ ·
 * ⓘ · вкладки · ⋯», кнопок нет; дерево свёрнуто — панель шире: «Архив досок» и «Создать доску» за вкладками, «Изменить»
 * справа, «⋯» нет. «Разработка» → RACC «Приёмка рядов» (E2eSeeder), Анна → e2e-admin. В конце дерево снова развёрнуто.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: { width: 1024, height: 768 } })

const SPACE = 'Приёмка рядов'

/** Элементы — в одной строке: вертикальные центры совпадают. */
async function expectOneLine(locators: Locator[]) {
  const centers = await Promise.all(
    locators.map(async (l) => {
      const box = (await l.boundingBox())!
      return box.y + box.height / 2
    }),
  )
  for (const center of centers) expect(Math.abs(center - centers[0])).toBeLessThanOrEqual(2)
}

test('ТК-L74.8. Панель на 1024 px с открытым деревом — одна строка с «⋯» @tc-L74.8', async ({ page }) => {
  // 1. Окно 1024, дерево открыто → пространство
  await openHome(page)
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  await expect(tree).toBeVisible()
  await tree.getByRole('link', { name: new RegExp(`^${SPACE}`) }).click()
  const heading = page.getByRole('heading', { name: SPACE, level: 1 })
  await expect(heading).toBeVisible()
  const key = page.locator('main').getByText('RACC', { exact: true })
  const tabs = page.getByRole('tablist').first()
  const menu = page.getByRole('button', { name: `Действия с пространством «${SPACE}»` })
  const archive = page.getByRole('button', { name: 'Архив досок', exact: true })
  const create = page.getByRole('button', { name: 'Создать доску', exact: true })
  const edit = page.getByRole('button', { name: 'Изменить', exact: true })

  // 2. Одна строка: название, ключ, ⓘ, вкладки, «⋯»; кнопок «Архив досок», «Создать доску», «Изменить» на панели нет
  await expectOneLine([heading, key, page.getByRole('button', { name: 'О пространстве' }), tabs, menu])
  for (const button of [archive, create, edit]) await expect(button).toBeHidden()
  const panel = (await heading.evaluate((h) => h.parentElement!.parentElement!.getBoundingClientRect().height)) as number
  expect(panel).toBeLessThan(60)

  // 3. «⋯» — все три пункта
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Архив досок', 'Создать доску…', 'Изменить…'])
  await page.keyboard.press('Escape')

  // 4. Свернуть дерево — панель шире: кнопки за вкладками, «Изменить» справа, «⋯» нет; всё в одну строку
  await page.getByRole('button', { name: 'Свернуть панель' }).click()
  await expect(tree).toBeHidden()
  await expect(archive).toBeVisible()
  await expect(menu).toBeHidden()
  await expectOneLine([heading, tabs, archive, create, edit])
  const gap = (await archive.boundingBox())!.x - ((await tabs.boundingBox())!.x + (await tabs.boundingBox())!.width)
  expect(gap).toBeLessThanOrEqual(17)

  // Дерево — обратно
  await page.getByRole('button', { name: 'Дерево', exact: true }).click()
  await expect(tree).toBeVisible()
  await expect(menu).toBeVisible()
})
