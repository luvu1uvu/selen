import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_1, detailsCell, eventRows, openCompanyEvents } from './helpers'

/**
 * ТК-R2.41: фильтр журнала по человеку (что он сделал и что сделали с ним); «Подробности» — целиком, без прокрутки вбок
 * (LATER-142). owner@ → e2e-owner, окно 1280 px. Вера → «E2E Администратор»: автор событий E2eSeeder и объект своих
 * входов. «Пункт чек-листа добавлен» — чек-листы E2eSeeder (uxBatch2, darkTheme); тест находит его фильтром «Тип
 * события»: другие тесты пишут в журнал свои события.
 */
test.use({ storageState: authFile('e2e-owner@selen.test'), viewport: { width: 1280, height: 800 } })

const PERSON = 'E2E Администратор'

/** Строки журнала: «Кто» и «Объект» (ячейки: Время, Событие, Кто, Объект, Подробности). */
function rows(page: Page): Promise<{ who: string; subject: string }[]> {
  return page
    .getByRole('main')
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })
    .evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = tr.querySelectorAll('td')
        return { who: cells[2]?.textContent ?? '', subject: cells[3]?.textContent?.trim() ?? '' }
      }),
    )
}

test('ТК-R2.41. Журнал: фильтр по человеку; «Подробности» целиком @tc-R2.41', async ({ page }) => {
  // 1. «Журнал событий» → «Человек»: только события, где он — автор («Кто») или объект
  await openCompanyEvents(page, COMPANY_1)
  const person = page.getByLabel('Человек')
  const id = await person.getByRole('option', { name: PERSON, exact: true }).getAttribute('value')
  expect(id).toBeTruthy()
  await person.selectOption({ label: PERSON })
  await expect
    .poll(async () => {
      const list = await rows(page)
      return list.length > 0 && list.every((row) => row.who.startsWith(PERSON) || row.subject === `user:${id}`)
    })
    .toBe(true)

  // 2. «Все люди», событие «Пункт чек-листа добавлен»: «Подробности» целиком, переносом строк, без «…»
  await person.selectOption({ label: 'Все люди' })
  await page.getByLabel('Тип события').selectOption({ label: 'Пункт чек-листа добавлен' })
  const details = detailsCell(eventRows(page, 'Пункт чек-листа добавлен').first())
  await expect(details).toBeVisible()
  const text = (await details.textContent()) ?? ''
  expect(text).not.toContain('…')
  expect(() => JSON.parse(text)).not.toThrow()
  const cell = await details.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return {
      clipped: el.scrollWidth > el.clientWidth,
      // Строк текста в ячейке: длинные подробности переносятся
      lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
    }
  })
  expect(cell.clipped).toBe(false)
  expect(cell.lines).toBeGreaterThan(1)

  // Таблица помещается по ширине: прокрутки вбок нет ни у таблицы, ни у страницы
  const table = page.getByRole('main').getByRole('table')
  const overflow = await table.evaluate((el) => {
    const scrolls = (node: Element | null) => !!node && node.scrollWidth > node.clientWidth
    return { container: scrolls(el.parentElement), main: scrolls(el.closest('main')) }
  })
  expect(overflow).toEqual({ container: false, main: false })
  expect((await table.boundingBox())!.x + (await table.boundingBox())!.width).toBeLessThanOrEqual(1280)
})
