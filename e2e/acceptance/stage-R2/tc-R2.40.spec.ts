import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { COMPANY_1, eventRows, openCompanyEvents, whoCell } from './helpers'

/**
 * ТК-R2.40: в журнале у входов — IP и браузер коротко, полная строка браузера — в подсказке. owner@ → e2e-owner.
 * Неверный пароль — одна попытка через форму в отдельном контексте без входа (сеанс не создаётся; вход через форму
 * в автотестах запрещён — лимит входов). «Затем верный пароль» — вход e2e-owner в auth.setup (через форму в браузере
 * прогона). Верхние «Успешный вход» и «Неудачная попытка входа» Владельца тест находит фильтрами «Тип события» и
 * «Человек»: другие тесты пишут в журнал свои события.
 */

test('ТК-R2.40. Журнал: IP и браузер входов @tc-R2.40', async ({ browser }) => {
  // 1. Страница входа: e2e-owner@ и неверный пароль → «Войти»
  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto('/login')
  await anonymous.getByLabel('Email').fill('e2e-owner@selen.test')
  await anonymous.getByLabel('Пароль').fill('wrong-password')
  await anonymous.getByRole('button', { name: 'Войти' }).click()
  await expect(anonymous.getByText('Неверный email или пароль.')).toBeVisible()
  const userAgent = await anonymous.evaluate(() => navigator.userAgent)

  // 2. «Администрирование» → «Журнал событий»: верхняя «Неудачная попытка входа» — «Без входа», IP, браузер коротко
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyEvents(owner, COMPANY_1)
  await owner.getByLabel('Человек').selectOption({ label: 'E2E Владелец' })
  const type = owner.getByLabel('Тип события')
  await type.selectOption({ label: 'Неудачная попытка входа' })
  const failed = whoCell(eventRows(owner, 'Неудачная попытка входа').first())
  await expect(failed).toContainText('Без входа')
  await expect(failed).toContainText(/IP \S+/)
  const short = failed.getByText(/^Chrome \d+ · \S+$/)
  await expect(short).toBeVisible()

  // 3. Наведение на браузер — подсказка с полной строкой
  await short.hover()
  await expect(owner.getByRole('tooltip')).toHaveText(userAgent)
  // …и с клавиатуры: браузер в строке получает фокус, подсказка та же
  // Увести мышь в пустое место страницы (по шагам, как рука: подсказка закрывается по движению мыши мимо неё)
  await owner.mouse.move(1000, 700, { steps: 10 })
  await expect(owner.getByRole('tooltip')).toHaveCount(0)
  await short.focus()
  await expect(owner.getByRole('tooltip')).toHaveText(userAgent)

  // Верхний «Успешный вход» — имя, IP и браузер коротко
  await type.selectOption({ label: 'Успешный вход' })
  const succeeded = whoCell(eventRows(owner, 'Успешный вход').first())
  await expect(succeeded).toContainText('E2E Владелец')
  await expect(succeeded).toContainText(/IP \S+/)
  await expect(succeeded.getByText(/^Chrome \d+ · \S+$/)).toBeVisible()
})
