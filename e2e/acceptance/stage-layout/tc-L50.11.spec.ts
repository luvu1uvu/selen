import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'

/**
 * ТК-L50.11 (решения PM 1–2 из плана пакета): шапка доски — в одну строку. Описание доски (две строки) — во
 * всплывающем окне за значком ⓘ: переносы строк сохранены, текст можно выделить; у доски без описания значка нет.
 * «Архив карточек» — пункт меню «⋯» шапки доски. Данные E2eSeeder: пространство «Раскладка», доски «С описанием»
 * (описание задано при создании) и «Длинная доска» (без описания); e2e-admin — администратор пространства.
 *
 * Исправлено основной сессией (LATER-64): первая версия теста создавала доску с описанием через окно «Новая доска»,
 * но поля описания в интерфейсе нет и не было — неверен был шаг тест-кейса, а не код. Описание теперь у готовой
 * доски, как у досок стенда PM. Тройной щелчок для выделения — по первой строке: по центру абзаца он попадал на
 * вторую, и проверка зависела от раскладки.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const DESCRIPTION = 'Первая строка описания\nВторая строка описания'

test('ТК-L50.11. Описание доски — за ⓘ, архив карточек — в меню «⋯» @tc-L50.11', async ({ page }) => {
  // У доски без описания значка ⓘ нет
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  await expect(page.getByRole('button', { name: 'Описание доски' })).toHaveCount(0)

  // 1. Доска с описанием
  await page
    .getByRole('navigation', { name: 'Дерево' })
    .getByRole('link', { name: 'С описанием', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'С описанием' })).toBeVisible()
  await expect(page.getByText('Первая строка описания')).toHaveCount(0)

  // 2. ⓘ рядом с названием: всплывающее окно с описанием, переносы строк сохранены, текст выделяется
  await page.getByRole('button', { name: 'Описание доски' }).click()
  const popover = page.getByRole('dialog').filter({ hasText: 'Первая строка описания' })
  await expect(popover).toBeVisible()
  // innerText — текст как на экране: перенос строки остаётся переносом, только если он виден
  expect(await popover.evaluate((e) => (e as HTMLElement).innerText.trim())).toBe(DESCRIPTION)
  // Тройной щелчок — по первой строке (центр двухстрочного абзаца приходится на вторую)
  await popover.getByText('Первая строка описания').click({ clickCount: 3, position: { x: 10, y: 6 } })
  expect(await page.evaluate(() => String(window.getSelection()))).toContain('Первая строка описания')
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()

  // 3. «⋯» справа в шапке доски → «Архив карточек»
  await page.getByRole('button', { name: 'Действия с доской' }).click()
  await page.getByRole('menuitem', { name: 'Архив карточек' }).click()
  await expect(page.getByRole('dialog', { name: 'Архив карточек' })).toBeVisible()
})
