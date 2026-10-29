import { expect, test } from '@playwright/test'
import { PASSWORD, pageAs } from '../../tests/helpers'
import { findUser, userRow } from '../stage-3/helpers'
import {
  COMPANY_1,
  EMAIL_CHANGE_LINK,
  detailsCell,
  eventRows,
  openCompanyEvents,
  openCompanyUsers,
  userActions,
  whoCell,
} from './helpers'

/**
 * ТК-R2.37: смена email — запрос администратором, подтверждение по ссылке нынешним паролем. owner@ → e2e-owner. В E2E
 * письма уходят в лог, не в почту, поэтому Борис — два человека E2eSeeder::sessionsAndEmail: запрос из окна (шаги 1–2,
 * «Запрошена смена email» в журнале) — у «E2E Смена email» (e2e-email@); ссылку из письма (шаги 4–6) открывает
 * «E2E Подтверждение email» (e2e-email-confirm@): смена на e2e-email-confirmed@ уже запрошена, ссылка известна
 * (EMAIL_CHANGE_TOKEN). Шаг 3 (письма в Mailpit) — только вручную; шаг 5 (вход прежним и новым адресом) — только
 * вручную (вход через форму в автотестах запрещён), вместо него — новый адрес в списке «Пользователи». Людей в списке
 * тест находит полем «Поиск по имени или email»: в списке 25 человек на странице.
 */

const REQUEST = 'E2E Смена email'
const CONFIRM = 'E2E Подтверждение email'

test('ТК-R2.37. Смена email: ссылка на новый адрес, подтверждение паролем @tc-R2.37', async ({ browser }) => {
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_1)
  const email = (name: string) => userRow(owner, name).getByRole('cell').nth(1)

  // 1. «⋯» → «Изменить email…»: «Сейчас: …»; новый адрес → «Отправить ссылку»
  await findUser(owner, REQUEST)
  await userActions(owner, REQUEST).click()
  await owner.getByRole('menuitem', { name: 'Изменить email…' }).click()
  const dialog = owner.getByRole('dialog', { name: 'Изменить email' })
  await expect(dialog).toContainText('Сейчас: e2e-email@selen.test')
  await dialog.getByLabel('Новый email').fill('e2e-email-new@selen.test')
  await dialog.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(dialog).toBeHidden()
  await expect(owner.getByText('Письмо со ссылкой отправлено на e2e-email-new@selen.test')).toBeVisible()

  // 2. В строке — «Новый: … — ждёт подтверждения», email пока прежний
  await expect(email(REQUEST)).toContainText('e2e-email@selen.test')
  await expect(email(REQUEST)).toContainText('Новый: e2e-email-new@selen.test — ждёт подтверждения')
  await findUser(owner, CONFIRM)
  await expect(email(CONFIRM)).toContainText('e2e-email-confirm@selen.test')
  await expect(email(CONFIRM)).toContainText('Новый: e2e-email-confirmed@selen.test — ждёт подтверждения')

  // 4. Ссылка из письма (без входа): «Новый email» с адресом и полем «Нынешний пароль»
  const link = await (await browser.newContext()).newPage()
  await link.goto(EMAIL_CHANGE_LINK)
  await expect(link.getByText('Новый email', { exact: true })).toBeVisible()
  await expect(link.getByText('Подтвердите новый email для входа в Selen: e2e-email-confirmed@selen.test.')).toBeVisible()
  const password = link.getByLabel('Нынешний пароль')
  const submit = link.getByRole('button', { name: 'Подтвердить адрес' })
  // Неверный пароль — «Неверный пароль.» под полем, email прежний
  await password.fill('wrong-password')
  await submit.click()
  await expect(link.getByText('Неверный пароль.', { exact: true })).toBeVisible()
  await owner.reload()
  await findUser(owner, CONFIRM)
  await expect(email(CONFIRM)).toContainText('Новый: e2e-email-confirmed@selen.test — ждёт подтверждения')
  // Верный пароль — «Email изменён на …»
  await password.fill(PASSWORD)
  await submit.click()
  await expect(link.getByRole('status')).toHaveText(
    'Email изменён на e2e-email-confirmed@selen.test. Войдите с новым адресом и тем же паролем.',
  )
  await expect(submit).toHaveCount(0)

  // 5. (вход — только вручную) В «Пользователях» — новый адрес, строки «Новый: …» нет
  await owner.reload()
  await findUser(owner, CONFIRM)
  await expect(email(CONFIRM)).toHaveText('e2e-email-confirmed@selen.test')

  // 6. «Журнал событий»: «Email изменён» — «Без входа», IP и браузер; адресов в «Подробностях» нет
  await openCompanyEvents(owner, COMPANY_1)
  const person = owner.getByLabel('Человек')
  await person.selectOption({ label: CONFIRM })
  const changed = eventRows(owner, 'Email изменён').first()
  await expect(whoCell(changed)).toContainText('Без входа')
  await expect(whoCell(changed)).toContainText(/IP \S+/)
  await expect(whoCell(changed)).toContainText(/Chrome \d+ · \S+/)
  await expect(detailsCell(changed)).not.toContainText('@')
  // «Запрошена смена email» — от Владельца, без адресов
  await person.selectOption({ label: REQUEST })
  const requested = eventRows(owner, 'Запрошена смена email').first()
  await expect(whoCell(requested)).toHaveText('E2E Владелец')
  await expect(detailsCell(requested)).not.toContainText('@')
})
