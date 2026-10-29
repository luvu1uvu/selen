import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_1, eventRows, openCompanyEvents, whoCell } from './helpers'

/**
 * ТК-R2.40: в журнале у входов — IP и браузер коротко, полная строка браузера — в подсказке. owner@ → e2e-owner.
 * Отступление от тест-кейса: вход через форму в автотестах запрещён и для неудачной попытки (лимит входов в минуту на IP —
 * auth.setup входит всеми пользователями E2E через форму), поэтому шаг 1 — из данных E2E: неудачная попытка входа
 * e2e-owner с известными IP и браузером (E2eSeeder::failedLogin); вручную она делается через форму. «Затем верный
 * пароль» — вход e2e-owner в auth.setup (через форму в браузере прогона). Верхние «Неудачная попытка входа» и «Успешный
 * вход» Владельца тест находит фильтрами «Тип события» и «Человек»: другие тесты пишут в журнал свои события.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

/** E2eSeeder::FAILED_LOGIN_IP и FAILED_LOGIN_USER_AGENT. */
const FAILED_IP = '203.0.113.40'
const FAILED_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

test('ТК-R2.40. Журнал: IP и браузер входов @tc-R2.40', async ({ page }) => {
  // 1–2. «Администрирование» → «Журнал событий»: верхняя «Неудачная попытка входа» — «Без входа», IP, браузер коротко
  await openCompanyEvents(page, COMPANY_1)
  await page.getByLabel('Человек').selectOption({ label: 'E2E Владелец' })
  const type = page.getByLabel('Тип события')
  await type.selectOption({ label: 'Неудачная попытка входа' })
  const failed = whoCell(eventRows(page, 'Неудачная попытка входа').first())
  await expect(failed).toContainText('Без входа')
  await expect(failed).toContainText(`IP ${FAILED_IP}`)
  const short = failed.getByText('Chrome 131 · macOS', { exact: true })
  await expect(short).toBeVisible()

  // 3. Наведение на браузер — подсказка с полной строкой
  await short.hover()
  await expect(page.getByRole('tooltip')).toHaveText(FAILED_USER_AGENT)
  // …и с клавиатуры: увести мышь в пустое место (по шагам, как рука — подсказка закрывается по движению мимо неё),
  // браузер в строке получает фокус — подсказка та же
  await page.mouse.move(1000, 700, { steps: 10 })
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await short.focus()
  await expect(page.getByRole('tooltip')).toHaveText(FAILED_USER_AGENT)

  // Верхний «Успешный вход» (вход в auth.setup) — имя, IP и браузер коротко
  await type.selectOption({ label: 'Успешный вход' })
  const succeeded = whoCell(eventRows(page, 'Успешный вход').first())
  await expect(succeeded).toContainText('E2E Владелец')
  await expect(succeeded).toContainText(/IP \S+/)
  await expect(succeeded.getByText(/^Chrome \d+ · \S+$/)).toBeVisible()
})
