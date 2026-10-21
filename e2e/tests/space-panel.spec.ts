import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Панель страницы пространства (LATER-74, решения PM 20.10 и дополнение 21.10): «Архив досок» и «Создать доску» — сразу
 * за вкладками и только на вкладке «Доски»; на экране 768 px и уже — одна строка «Название · ключ · ⓘ · вкладки · ⋯»,
 * кнопки — пунктами меню «⋯». Пространство ROWS «Ряды» (E2eSeeder): e2e-admin — администратор, e2e-editor — редактор.
 * Окна только открываются и закрываются — доски не создаются (space.spec сверяет ряды ROWS).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const menuLabel = 'Действия с пространством «Ряды»'

async function openRows(page: Page) {
  await page.goto('/spaces/ROWS')
  await expect(page.getByRole('heading', { name: 'Ряды', level: 1 })).toBeVisible()
}

const box = async (locator: Locator) => (await locator.boundingBox())!

/** Элементы панели — в одной строке: вертикальные центры совпадают. */
async function expectOneLine(locators: Locator[]) {
  const centers = await Promise.all(locators.map(async (l) => (await box(l)).y + (await box(l)).height / 2))
  for (const center of centers) expect(Math.abs(center - centers[0])).toBeLessThanOrEqual(2)
}

test('широкий экран: «Архив досок» и «Создать доску» — сразу за вкладками и только на «Досках»', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openRows(page)
  // Первый список вкладок — панели (у «Участников» есть свои вкладки «Люди / Группы»)
  const tabs = page.getByRole('tablist').first()
  const archive = page.getByRole('button', { name: 'Архив досок', exact: true })
  const create = page.getByRole('button', { name: 'Создать доску', exact: true })
  const edit = page.getByRole('button', { name: 'Изменить', exact: true })

  await expect(page.getByRole('button', { name: menuLabel })).toBeHidden()
  await expectOneLine([tabs, archive, create, edit])
  // Ближе к вкладкам, как в Kaiten: «Архив досок» — сразу за ними; правая часть панели свободна под «Фильтры»
  expect((await box(archive)).x - ((await box(tabs)).x + (await box(tabs)).width)).toBeLessThanOrEqual(17)
  expect((await box(create)).x - ((await box(archive)).x + (await box(archive)).width)).toBeLessThanOrEqual(9)
  expect((await box(edit)).x - ((await box(create)).x + (await box(create)).width)).toBeGreaterThan(100)

  await page.getByRole('tab', { name: 'Участники' }).click()
  await expect(archive).toHaveCount(0)
  await expect(create).toHaveCount(0)
  await expect(edit).toBeVisible()
  await page.getByRole('tab', { name: 'Метки' }).click()
  await expect(archive).toHaveCount(0)
  await expect(create).toHaveCount(0)
})

test('узкий экран (375 px): панель в одну строку, кнопки — пунктами меню «⋯»', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openRows(page)
  const heading = page.getByRole('heading', { name: 'Ряды', level: 1 })
  const menu = page.getByRole('button', { name: menuLabel })

  await expectOneLine([heading, page.getByText('ROWS', { exact: true }), page.getByRole('tablist').first(), menu])
  expect((await box(menu)).x + (await box(menu)).width).toBeLessThanOrEqual(375 - 12 + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  for (const name of ['Архив досок', 'Создать доску', 'Изменить'])
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden()

  // «⋯» — с подсказкой по фокусу с клавиатуры (Tab с активной вкладки); пункты — все, на которые есть права
  await page.getByRole('tab', { name: 'Доски' }).focus()
  await page.keyboard.press('Tab')
  await expect(menu).toBeFocused()
  await expect(page.getByRole('tooltip')).toHaveText(menuLabel)
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Архив досок', 'Создать доску…', 'Изменить…'])

  // Пункт открывает окно; закрытое окно возвращает фокус на «⋯»
  await page.getByRole('menuitem', { name: 'Создать доску…' }).click()
  await expect(page.getByRole('dialog', { name: 'Новая доска' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menu).toBeFocused()

  await menu.click()
  await page.getByRole('menuitem', { name: 'Архив досок' }).click()
  await expect(page.getByRole('dialog', { name: 'Архив досок' })).toBeVisible()
  await page.keyboard.press('Escape')

  await menu.click()
  await page.getByRole('menuitem', { name: 'Изменить…' }).click()
  await expect(page.getByRole('dialog', { name: 'Пространство' })).toBeVisible()
  await page.keyboard.press('Escape')

  // На «Участниках» — только «Изменить…»
  await page.getByRole('tab', { name: 'Участники' }).click()
  await expectOneLine([heading, page.getByRole('tablist').first(), menu])
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Изменить…'])
  await page.keyboard.press('Escape')
})

test('узкий экран, 768 px: одна строка; у редактора на «Участниках» «⋯» нет', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: authFile('e2e-editor@selen.test'),
    viewport: { width: 768, height: 900 },
  })
  const page = await context.newPage()
  await openRows(page)
  const menu = page.getByRole('button', { name: menuLabel })
  await expectOneLine([page.getByRole('heading', { name: 'Ряды', level: 1 }), page.getByRole('tablist').first(), menu])

  // Редактору доступен только «Архив досок»
  await menu.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Архив досок'])
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Участники' }).click()
  await expect(menu).toHaveCount(0)
  await context.close()
})
