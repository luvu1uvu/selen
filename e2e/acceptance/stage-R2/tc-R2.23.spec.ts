import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { chooseCompany, COMPANY_2, COMPANY_3, openCompanyUsers, stamp, usersTabs } from './helpers'

/**
 * ТК-R2.23: администратор нескольких компаний явно выбирает, куда приглашает; у остальных выбора нет. irina@ →
 * e2e-multi-admin («E2E Компания 2» и «E2E Компания 3»), admin@ → e2e-admin (только «Компания 1»). Email приглашения —
 * с одноразовой меткой (тест можно повторить). Лимит приглашений e2e-multi-admin на минуту исчерпывает ТК-R2.14: если
 * прогон дошёл сюда раньше, чем через минуту после него (make e2e-stage STAGE=R2), ждём столько, сколько называет
 * уведомление о лимите, и отправляем ещё раз — как ТК-R2.14 при повторе.
 */

/** «Отправить приглашение» — дождаться ответа сервера, вернуть его код. */
async function submit(page: Page) {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/admin\/companies\/[^/]+\/invitations$/.test(r.url()),
  )
  await page.getByRole('dialog', { name: 'Пригласить пользователя' }).getByRole('button', { name: 'Отправить приглашение' }).click()
  return (await response).status()
}

test('ТК-R2.23. Выбор компании в окне приглашения — только у кого их несколько @tc-R2.23', async ({ browser }) => {
  test.setTimeout(120_000)
  const email = `tk-r223-${stamp()}@selen.test`

  // 1. Администратор двух компаний: «Пользователи» (сейчас — вторая компания) → «Пригласить»: поле «Компания»
  const multi = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await openCompanyUsers(multi, COMPANY_2)
  await multi.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = multi.getByRole('dialog', { name: 'Пригласить пользователя' })
  const company = dialog.getByLabel('Компания', { exact: true })
  await expect(company.getByRole('option')).toHaveText([COMPANY_2, COMPANY_3])

  // 2. «Компания» — третья; имя «Проверка», email → «Отправить приглашение»
  await company.selectOption({ label: COMPANY_3 })
  await dialog.getByLabel('Имя и фамилия').fill('Проверка')
  await dialog.getByLabel('Рабочий email').fill(email)
  if ((await submit(multi)) === 429) {
    // «…Продолжить можно через N сек.» (или «1 мин.») — ждём столько и ещё секунду
    const limit = multi.getByText(/^Слишком много приглашений/)
    const left = /через (\d+) сек/.exec(await limit.innerText())
    await multi.waitForTimeout(((left ? Number(left[1]) : 60) + 1) * 1000)
    expect(await submit(multi)).toBeLessThan(300)
  }
  await expect(dialog).toBeHidden()
  await expect(multi.getByText(`Приглашение отправлено на ${email}`)).toBeVisible()

  // Во второй компании (открыта сейчас) приглашения нет
  await usersTabs(multi).getByRole('link', { name: 'Приглашения' }).click()
  await expect(multi).toHaveURL(/\/invitations$/)
  await expect(multi.getByRole('columnheader', { name: 'Состояние' })).toBeVisible()
  await expect(multi.getByRole('row').filter({ hasText: email })).toHaveCount(0)

  // 3. Выбор компании над меню → третья → «Пользователи» → «Приглашения»: приглашение «Проверка» — здесь
  await chooseCompany(multi, COMPANY_3)
  await expect(multi).toHaveURL(/\/invitations$/)
  const invitation = multi.getByRole('row').filter({ hasText: email })
  await expect(invitation).toContainText('Проверка')
  await expect(invitation).toContainText('Ожидает принятия')

  // 4. Администратор одной компании: «Пригласить» — поля «Компания» нет
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  await admin.getByRole('button', { name: 'Пригласить' }).click()
  const single = admin.getByRole('dialog', { name: 'Пригласить пользователя' })
  await expect(single.getByLabel('Имя и фамилия')).toBeVisible()
  await expect(single.getByLabel('Компания', { exact: true })).toHaveCount(0)
  await single.getByRole('button', { name: 'Отмена' }).click()
  await expect(single).toBeHidden()
})
