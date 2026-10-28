import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { chooseCompany, COMPANY_1, COMPANY_2, COMPANY_3, openAdminPanel } from './helpers'

/**
 * ТК-R2.14: по ответу на приглашение нельзя перебирать email. admin@ → e2e-multi-admin в «E2E Компании 2» (лимит —
 * на приглашающего: этот пользователь больше нигде не приглашает, ТК-3.25 и ТК-R2.5 не задеты). С П2c-1 (решение PM
 * 28.10, п. 4) сотрудник другой компании по приглашению сразу добавляется («Сотрудник добавлен» — ТК-R2.22): раскрытие
 * «email есть в Selen» принято, поэтому шаг 1 тест-кейса П2b-2 (kirill@ — «Этот email уже используется в Selen»)
 * устарел и здесь не повторяется — приглашение добавило бы человека в компанию. Проверяется оставшийся смысл: на email
 * сотрудника этой компании — один и тот же ответ без названий компаний, в том числе у того, кто работает ещё
 * и в другой компании (e2e-two-homes@ — «дом» и в «Компании 1»), и лимит приглашений, в который входят и отказы.
 * anna@ (сотрудница своей компании) → e2e-second@. Занятые email приглашений не создают — данные не меняются. «Через
 * минуту приглашать снова можно» скрипт не ждёт (минута в прогоне E2E) — только вручную; при повторе теста в CI
 * (retries) ждём, пока лимит первой попытки истечёт.
 */
test.use({ storageState: authFile('e2e-multi-admin@selen.test') })

const TAKEN = 'Этот сотрудник уже работает в компании.'
const LIMIT = 'Слишком много приглашений: не больше 10 в минуту и 300 в сутки. Продолжить можно через'

/** «Отправить приглашение» — дождаться ответа сервера, вернуть его код. */
async function submit(page: Page) {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/admin\/companies\/[^/]+\/invitations$/.test(r.url()),
  )
  await page.getByRole('dialog', { name: 'Пригласить пользователя' }).getByRole('button', { name: 'Отправить приглашение' }).click()
  return (await response).status()
}

test('ТК-R2.14. Приглашение на email сотрудника компании — один ответ; лимит приглашений @tc-R2.14', async ({ page }, testInfo) => {
  if (testInfo.retry > 0) {
    // Лимит в минуту считает и отказы первой попытки — ждём, пока он истечёт
    test.setTimeout(120_000)
    await page.waitForTimeout(61_000)
  }

  // 1. Администрирование → вторая компания → «Пользователи» → «Пригласить»: email сотрудника этой компании
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await chooseCompany(page, COMPANY_2)
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })
  await dialog.getByLabel('Имя и фамилия').fill('Проверка')
  const email = dialog.getByLabel('Рабочий email')
  await email.fill('e2e-second@selen.test')
  expect(await submit(page)).toBe(422)
  const error = dialog.getByText(TAKEN)
  await expect(error).toBeVisible()
  const answer = (await error.innerText()).trim()
  // Ни одного названия компании
  expect(answer).not.toMatch(new RegExp(`${COMPANY_1}|${COMPANY_2}|${COMPANY_3}`))

  // 2. Email сотрудника этой компании, который работает и в другой, — тот же текст
  await email.fill('e2e-two-homes@selen.test')
  expect(await submit(page)).toBe(422)
  await expect(error).toBeVisible()
  expect((await error.innerText()).trim()).toBe(answer)

  // 3. Ещё 9 раз подряд: отказы тоже считаются — 10-я попытка ещё отвечает про email, 11-я упирается в лимит
  for (let attempt = 3; attempt <= 10; attempt++) expect(await submit(page), `попытка ${attempt}`).toBe(422)
  expect(await submit(page), 'попытка 11').toBe(429)
  await expect(page.getByText(LIMIT)).toBeVisible()
  await expect(page.getByText(LIMIT)).toHaveText(/через (\d+ сек|1 мин)\.$/)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
})
