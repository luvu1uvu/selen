import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { expectHint, isTruncated } from './helpers'

/**
 * ТК-L74.3 (LATER-74, дополнение PM 21.10): на узком экране (375 и 768 px) панель пространства — одна строка «Название ·
 * ключ · ⓘ · вкладки · ⋯»; кнопки «Архив досок», «Создать доску», «Изменить» — пунктами «⋯», каждый открывает своё окно;
 * на «Участниках» в «⋯» — только «Изменить…»; обрезанное название — полное в подсказке. «Разработка» → RACC «Приёмка
 * рядов» (E2eSeeder), Анна → e2e-admin. Окна только открываются и закрываются.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: { width: 375, height: 812 } })

const SPACE = 'Приёмка рядов'
const MENU = `Действия с пространством «${SPACE}»`

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

function panel(page: Page) {
  return {
    heading: page.getByRole('heading', { name: SPACE, level: 1 }),
    key: page.locator('main').getByText('RACC', { exact: true }),
    info: page.getByRole('button', { name: 'О пространстве', exact: true }),
    tabs: page.getByRole('tablist').first(),
    menu: page.getByRole('button', { name: MENU }),
  }
}

/** Пункт «⋯» открывает своё окно; окно закрывается. */
async function openFromMenu(page: Page, item: string, dialog: string, close: 'Escape' | 'Отмена') {
  await page.getByRole('button', { name: MENU }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
  const window = page.getByRole('dialog', { name: dialog })
  await expect(window).toBeVisible()
  if (close === 'Escape') await page.keyboard.press('Escape')
  else await window.getByRole('button', { name: 'Отмена' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('ТК-L74.3. Панель пространства на узком экране — одна строка, кнопки в «⋯» @tc-L74.3', async ({ page }) => {
  // 1. Меню ☰ → Дерево → пространство
  await openHome(page)
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await page
    .getByRole('navigation', { name: 'Дерево' })
    .getByRole('link', { name: new RegExp(`^${SPACE}`) })
    .click()
  const { heading, key, info, tabs, menu } = panel(page)
  await expect(heading).toBeVisible()

  // 2. Одна строка: название, ключ, вкладки, «⋯»; кнопок на панели нет; название обрезано — полное в подсказке
  await expectOneLine([heading, key, info, tabs, menu])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  for (const name of ['Архив досок', 'Создать доску', 'Изменить'])
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden()
  expect(await isTruncated(heading)).toBe(true)
  await heading.hover()
  await expectHint(page, SPACE)

  // 3–4. В «⋯» — «Архив досок», «Создать доску…», «Изменить…»; каждый открывает своё окно
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Архив досок', 'Создать доску…', 'Изменить…'])
  await page.keyboard.press('Escape')
  await openFromMenu(page, 'Создать доску…', 'Новая доска', 'Отмена')
  await openFromMenu(page, 'Архив досок', 'Архив досок', 'Escape')
  await openFromMenu(page, 'Изменить…', 'Пространство', 'Escape')

  // 5. «Участники» → «⋯»: только «Изменить…»
  await page.getByRole('tab', { name: 'Участники' }).click()
  await expectOneLine([heading, tabs, menu])
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Изменить…'])
  await page.keyboard.press('Escape')

  // 6. Ширина 768 — тоже одна строка, кнопок на панели нет
  await page.setViewportSize({ width: 768, height: 900 })
  await page.getByRole('tab', { name: 'Доски' }).click()
  await expectOneLine([heading, key, info, tabs, menu])
  for (const name of ['Архив досок', 'Создать доску', 'Изменить'])
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768)
})
