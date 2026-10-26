import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_2, companySelect, openAdminPanel } from './helpers'

/**
 * ТК-R2.14: по ответу на приглашение нельзя узнать, что человек работает в другой компании, и нельзя перебирать email.
 * admin@ → e2e-multi-admin в «E2E Компании 2» (лимит — на приглашающего: этот пользователь больше нигде
 * не приглашает, ТК-3.25 и ТК-R2.5 не задеты); kirill@ (сотрудник другой компании) → e2e-admin@ («Компания 1»),
 * anna@ (сотрудница своей компании) → e2e-second@ («E2E Компания 2»). Занятые email приглашений не создают — данные
 * не меняются. «Через минуту приглашать снова можно» скрипт не ждёт (минута в прогоне E2E) — только вручную;
 * при повторе теста в CI (retries) ждём, пока лимит первой попытки истечёт.
 */
test.use({ storageState: authFile('e2e-multi-admin@selen.test') })

const TAKEN = 'Этот email уже используется в Selen'
const LIMIT = 'Слишком много приглашений: не больше 10 в минуту и 300 в сутки. Продолжить можно через'

/** «Отправить приглашение» — дождаться ответа сервера, вернуть его код. */
async function submit(page: Page) {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/admin\/companies\/[^/]+\/invitations$/.test(r.url()),
  )
  await page.getByRole('dialog', { name: 'Пригласить пользователя' }).getByRole('button', { name: 'Отправить приглашение' }).click()
  return (await response).status()
}

test('ТК-R2.14. Приглашение на занятый email — один ответ; лимит приглашений @tc-R2.14', async ({ page }, testInfo) => {
  if (testInfo.retry > 0) {
    // Лимит в минуту считает и отказы первой попытки — ждём, пока он истечёт
    test.setTimeout(120_000)
    await page.waitForTimeout(61_000)
  }

  // 1. Администрирование → вторая компания → «Пользователи» → «Пригласить»: email сотрудника другой компании
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await companySelect(page).selectOption({ label: COMPANY_2 })
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })
  await dialog.getByLabel('Имя и фамилия').fill('Проверка')
  const email = dialog.getByLabel('Рабочий email')
  await email.fill('e2e-admin@selen.test')
  expect(await submit(page)).toBe(422)
  const error = dialog.getByText(TAKEN)
  await expect(error).toBeVisible()
  const otherCompany = (await error.innerText()).trim()
  // Ни слова о компании
  expect(otherCompany).not.toMatch(/компани/i)

  // 2. Email сотрудника своей компании — тот же текст
  await email.fill('e2e-second@selen.test')
  expect(await submit(page)).toBe(422)
  await expect(error).toBeVisible()
  expect((await error.innerText()).trim()).toBe(otherCompany)

  // 3. Ещё 9 раз подряд: отказы тоже считаются — 10-я попытка ещё отвечает про email, 11-я упирается в лимит
  for (let attempt = 3; attempt <= 10; attempt++) expect(await submit(page), `попытка ${attempt}`).toBe(422)
  expect(await submit(page), 'попытка 11').toBe(429)
  await expect(page.getByText(LIMIT)).toBeVisible()
  await expect(page.getByText(LIMIT)).toHaveText(/через (\d+ сек|1 мин)\.$/)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
})
