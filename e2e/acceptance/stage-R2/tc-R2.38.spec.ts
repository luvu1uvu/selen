import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { findUser, userRow } from '../stage-3/helpers'
import { COMPANY_1, EMAIL_CANCEL_LINK, openCompanyUsers, userActions } from './helpers'

/**
 * ТК-R2.38: на занятый адрес email не сменить; запрос смены можно отменить — ссылка перестаёт работать. owner@ →
 * e2e-owner, Вера — «E2E Смена email» (e2e-email@, E2eSeeder::sessionsAndEmail; если ТК-R2.37 уже прошёл, у неё есть
 * запрос — шаг 2 заменяет его), anna@ (занятый адрес) → e2e-admin@. Шаг 4: токен ссылки из письма автотест не узнает
 * (в E2E письма уходят в лог), поэтому ссылку проверяет на «E2E Email к отмене» — запрос смены у него уже есть,
 * ссылка известна (EMAIL_CANCEL_TOKEN): до отмены она открывает форму, после — «недействительна». Письмо в Mailpit —
 * только вручную. Людей в списке тест находит полем «Поиск по имени или email»: в списке 25 человек на странице.
 */

const PERSON = 'E2E Смена email'
const CANCEL = 'E2E Email к отмене'

test('ТК-R2.38. Смена email: занятый адрес и отмена @tc-R2.38', async ({ browser }) => {
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_1)
  const email = (name: string) => userRow(owner, name).getByRole('cell').nth(1)

  // 1. «⋯» → «Изменить email…» → чужой адрес → «Отправить ссылку»: ошибка под полем, окно не закрылось
  await findUser(owner, PERSON)
  await userActions(owner, PERSON).click()
  await owner.getByRole('menuitem', { name: 'Изменить email…' }).click()
  const dialog = owner.getByRole('dialog', { name: 'Изменить email' })
  const field = dialog.getByLabel('Новый email')
  const send = dialog.getByRole('button', { name: 'Отправить ссылку' })
  await field.fill('e2e-admin@selen.test')
  await send.click()
  await expect(dialog.getByText('Этот email уже используется в Selen.', { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()

  // 2. Свободный адрес → «Отправить ссылку»: в строке — «Новый: … — ждёт подтверждения»
  await field.fill('e2e-email-other@selen.test')
  await send.click()
  await expect(dialog).toBeHidden()
  await expect(email(PERSON)).toContainText('Новый: e2e-email-other@selen.test — ждёт подтверждения')

  // 3. «⋯» → «Отменить смену email»: «Смена email отменена», строки «Новый: …» нет, email прежний
  await userActions(owner, PERSON).click()
  await owner.getByRole('menuitem', { name: 'Отменить смену email' }).click()
  await expect(owner.getByText('Смена email отменена')).toBeVisible()
  await expect(email(PERSON)).toHaveText('e2e-email@selen.test')

  // 4. Ссылка отменённого запроса: «Ссылка недействительна или устарела…», кнопки «Подтвердить адрес» нет
  const link = await (await browser.newContext()).newPage()
  await link.goto(EMAIL_CANCEL_LINK)
  await expect(link.getByRole('button', { name: 'Подтвердить адрес' })).toBeVisible()
  await findUser(owner, CANCEL)
  await expect(email(CANCEL)).toContainText('Новый: e2e-email-cancel-new@selen.test — ждёт подтверждения')
  await userActions(owner, CANCEL).click()
  await owner.getByRole('menuitem', { name: 'Отменить смену email' }).click()
  await expect(email(CANCEL)).toHaveText('e2e-email-cancel@selen.test')
  await link.reload()
  await expect(link.getByText(/^Ссылка недействительна или устарела/)).toBeVisible()
  await expect(link.getByRole('button', { name: 'Подтвердить адрес' })).toHaveCount(0)
})
