import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { COMPANY_1, openCompanyUsers } from './helpers'

/**
 * ТК-R2.35: «Последняя активность» в «Пользователях» и сортировка по ней. owner@ → e2e-owner («E2E Владелец»: вошёл
 * в auth.setup — время сегодняшнее). Демо-время Демо Участника, Анны, Бориса и Демо Администратора в E2E — у людей,
 * которые не входят в систему (E2eSeeder::sessionsAndEmail): «E2E Руководитель» — вчера, «E2E Участник ролей» — 9 дней
 * назад, «E2E Кандидат» — 30 дней назад. Порядок проверяется у них и у Владельца: у остальных вошедших в систему время
 * тоже сегодняшнее, их взаимный порядок зависит от прогона. «—» — у «E2E Email к отмене» (не входит в систему).
 * Сортировка данных не меняет.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const OWNER = 'E2E Владелец'
/** От недавних к давним (E2eSeeder::sessionsAndEmail). */
const SEEDED = ['E2E Руководитель', 'E2E Участник ролей', 'E2E Кандидат']
const NEVER = 'E2E Email к отмене'
/** «28 окт. 2026 г., 17:56» — formatDateTime. */
const DATE_TIME = /^\d{1,2}\s\S+\s\d{4}\sг\.,\s\d{2}:\d{2}$/

type Row = { name: string; seen: string }

/** Строки списка по порядку: имя и «Последняя активность» (ячейки: Имя, Email, Роль, Статус, Последняя активность). */
function rows(page: Page): Promise<Row[]> {
  return page
    .getByRole('main')
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })
    .evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = tr.querySelectorAll('td')
        return {
          name: cells[0]?.querySelector('a')?.textContent?.trim() ?? '',
          seen: cells[4]?.textContent?.trim() ?? '',
        }
      }),
    )
}

/** Порядок Владельца и людей с заданным временем в списке. */
const order = (list: Row[]) => list.filter((row) => [OWNER, ...SEEDED].includes(row.name)).map((row) => row.name)

/** Люди с «—» — в конце: после первого «—» времени больше нет. */
function dashesLast(list: Row[]) {
  const first = list.findIndex((row) => row.seen === '—')
  return first === -1 || list.slice(first).every((row) => row.seen === '—')
}

test('ТК-R2.35. «Последняя активность» и сортировка по ней @tc-R2.35', async ({ page }) => {
  // 1. «Администрирование» → «Пользователи»: столбец «Последняя активность»
  await openCompanyUsers(page, COMPANY_1)
  const header = page.getByRole('columnheader', { name: 'Последняя активность' })
  const button = header.getByRole('button', { name: 'Последняя активность' })
  await expect(header).not.toHaveAttribute('aria-sort')
  const seen = (name: string) => userRow(page, name).getByRole('cell').nth(4)
  // У Владельца — время текущего входа (сегодня, по часовому поясу пользователя — Москва)
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date()),
  )
  await expect(seen(OWNER)).toHaveText(DATE_TIME)
  await expect(seen(OWNER)).toContainText(today)
  await expect(seen('E2E Кандидат')).toHaveText(DATE_TIME)
  await expect(seen('E2E Кандидат')).not.toContainText(today)
  await expect(seen(NEVER)).toHaveText('—')
  const byName = await rows(page)

  // 2. Нажать на заголовок: сверху — недавние, люди с «—» — в конце
  await button.click()
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  await expect.poll(async () => order(await rows(page))).toEqual([OWNER, ...SEEDED])
  expect(dashesLast(await rows(page))).toBe(true)

  // 3. Ещё раз: сверху — давние, люди с «—» — по-прежнему в конце
  await button.click()
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  await expect.poll(async () => order(await rows(page))).toEqual([...SEEDED].reverse().concat(OWNER))
  const ascending = await rows(page)
  expect(ascending.slice(0, SEEDED.length).map((row) => row.name)).toEqual([...SEEDED].reverse())
  expect(dashesLast(ascending)).toBe(true)

  // 4. Ещё раз: снова по имени, как до шага 2
  await button.click()
  await expect(header).not.toHaveAttribute('aria-sort')
  await expect.poll(async () => (await rows(page)).map((row) => row.name)).toEqual(byName.map((row) => row.name))
})
