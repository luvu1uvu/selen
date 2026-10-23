import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Дерево с длинными названиями (ТК-L109.1–L109.3). Вместо переименования «Продуктовых команд» и доски «Продукт» — данные
 * E2eSeeder с длинными названиями на всех уровнях (константы E2eSeeder::LONG_*): папка → вложенная папка → пространство
 * LONGTREE → доска; видит их только администратор (e2e-admin — Анна тест-кейсов, администратор Selen).
 */
export const LONG_FOLDER = 'E2E Папка с очень длинным названием, которое не помещается в дерево'
export const LONG_SUBFOLDER = 'E2E Вложенная папка с очень длинным названием для многоточия'
export const LONG_SPACE = 'E2E Пространство с очень длинным названием для проверки многоточия'
export const LONG_BOARD = 'E2E Доска с очень длинным названием на самом глубоком уровне дерева'

export const tree = (page: Page) => page.getByRole('navigation', { name: 'Дерево' })

/** Строка папки — кнопка раскрытия с названием. */
export const folderRow = (page: Page, name: string) => tree(page).getByRole('button', { name, exact: true })

async function expandRow(row: Locator) {
  if ((await row.getAttribute('aria-expanded')) === 'false') await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
}

/** Раскрыть папки и пространство с длинными названиями; возвращает строки папки и доски. */
export async function openLongTree(page: Page) {
  await page.goto('/')
  const folder = folderRow(page, LONG_FOLDER)
  await expandRow(folder)
  await expandRow(folderRow(page, LONG_SUBFOLDER))
  // Раскрытое пространство запоминается в браузере, а у стрелки меняется подпись — раскрыть, только если свёрнуто
  const toggle = tree(page).getByRole('button', { name: `Раскрыть «${LONG_SPACE}»` })
  if (await toggle.isVisible()) await toggle.click()
  const board = tree(page).getByRole('link', { name: LONG_BOARD, exact: true })
  await expect(board).toBeVisible()
  return { folder, board }
}
