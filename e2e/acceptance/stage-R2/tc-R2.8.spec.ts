import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCardByKey } from '../stage-ux2/helpers'
import { COMPANY_KEY, COMPANY_SPACE } from './helpers'

/**
 * ТК-R2.8: корзина и журнал — в компании; в «Компании 1» видно всё, что было видно раньше. admin@ → e2e-admin
 * (администратор компании и RCOMP «Права: компания»), карточка доски «Продукт» → RCOMP-2 «В корзину и обратно»
 * (E2eSeeder::companies). Прогон E2E идёт в один поток (playwright.config, workers: 1) — между удалением,
 * восстановлением и журналом событий других записей нет.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const KEY = `${COMPANY_KEY}-2`
const TITLE = 'В корзину и обратно'

const tile = (page: Page) => page.getByRole('button', { name: `Открыть ${KEY}: ${TITLE}` })

/** «Администрирование» → раздел меню. Раздел боковой панели запоминается: уже открытый повторное нажатие закрыло бы. */
async function openAdmin(page: Page, section: string) {
  const rail = page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Администрирование' })
  await expect(rail).toBeVisible()
  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click()
  const sections = page.getByRole('navigation', { name: 'Администрирование' })
  await sections.getByRole('link', { name: section, exact: true }).click()
  await expect(page.getByRole('heading', { name: section, level: 1 })).toBeVisible()
}

test('ТК-R2.8. Корзина и журнал событий — как раньше @tc-R2.8', async ({ page }) => {
  // 1. Карточка доски «Продукт» → «⋯» → «Удалить…» → подтвердить
  const window = await openCardByKey(page, KEY, TITLE)
  await window.getByRole('button', { name: `Действия с карточкой «${TITLE}»` }).click()
  await page.getByRole('menuitem', { name: 'Удалить…' }).click()
  const confirm = page.getByRole('dialog', { name: `Удалить ${KEY}?` })
  await confirm.getByRole('button', { name: 'Удалить', exact: true }).click()

  // Карточка пропала с доски (доска на месте — соседняя карточка видна)
  await expect(window).toBeHidden()
  await expect(page.getByText('Карточка удалена в корзину')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Продукт' })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^Открыть ${COMPANY_KEY}-1: `) })).toBeVisible()
  await expect(tile(page)).toHaveCount(0)
  const board = page.url()

  // 2. Администрирование → Корзина: карточка там → «Восстановить»
  await openAdmin(page, 'Корзина')
  const row = page.getByRole('row').filter({ hasText: KEY })
  await expect(row).toContainText(TITLE)
  await expect(row).toContainText(COMPANY_SPACE)
  await expect(row).toContainText('E2E Администратор')
  await row.getByRole('button', { name: `Восстановить ${KEY}` }).click()
  await expect(page.getByText(`${KEY} восстановлена`)).toBeVisible()
  await expect(row).toHaveCount(0)

  // После восстановления — снова на доске
  await page.goto(board)
  await expect(tile(page)).toBeVisible()

  // 3. Журнал событий: сверху — восстановление и удаление этой карточки, от имени администратора
  await openAdmin(page, 'Журнал событий')
  const rows = page.getByRole('main').getByRole('row')
  const cell = (index: number, column: number) => rows.nth(index).getByRole('cell').nth(column)
  await expect(cell(1, 1)).toHaveText('Карточка восстановлена из корзины')
  await expect(cell(1, 2)).toHaveText('E2E Администратор')
  await expect(cell(2, 1)).toHaveText('Карточка удалена в корзину')
  await expect(cell(2, 2)).toHaveText('E2E Администратор')
  const object = (await cell(1, 3).innerText()).trim()
  expect(object).toMatch(/^card:/)
  await expect(cell(2, 3)).toHaveText(object)
  // Ниже — прежние события
  await expect(rows.nth(3)).toBeVisible()

  // Вход и события данных до теста (создание пространств сидером) — тоже видны
  const type = page.getByLabel('Тип события')
  await type.selectOption({ label: 'Успешный вход' })
  await expect(cell(1, 1)).toHaveText('Успешный вход')
  await type.selectOption({ label: 'Пространство создано' })
  await expect(cell(1, 1)).toHaveText('Пространство создано')
  await expect(rows.filter({ hasText: 'Пространство создано' }).nth(1)).toBeVisible()
})
