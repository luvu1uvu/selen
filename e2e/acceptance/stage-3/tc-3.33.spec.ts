import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, pageAs } from '../../tests/helpers'
import { openUsers, submitTransfer, userRow } from './helpers'

/** Id пользователя — из ссылки на его страницу в списке «Пользователи». */
async function userId(page: Page, name: string) {
  const href = await userRow(page, name).getByRole('link', { name, exact: true }).getAttribute('href')
  return href!.split('/').pop()!
}

test('ТК-3.33. Передача владения в журнале — без личных данных @tc-3.33', async ({ browser }) => {
  // Предусловие (ТК-3.27): владение передано и возвращено — здесь своё, чтобы тест шёл и отдельно
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  await openUsers(ownerPage)
  const ownerId = await userId(ownerPage, 'E2E Владелец')
  const adminId = await userId(ownerPage, 'E2E Администратор')
  await submitTransfer(ownerPage, 'E2E Адм', 'E2E Администратор', PASSWORD)
  await expect(ownerPage.getByText('Владение передано: E2E Администратор — новый Владелец')).toBeVisible()
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await openUsers(adminPage)
  await submitTransfer(adminPage, 'E2E Влад', 'E2E Владелец', PASSWORD)
  await expect(adminPage.getByText('Владение передано: E2E Владелец — новый Владелец')).toBeVisible()

  // 1. «Журнал событий», фильтр «Передача владения»
  await ownerPage.goto('/admin/events')
  await expect(ownerPage.getByRole('heading', { name: 'Журнал событий', level: 1 })).toBeVisible()
  await ownerPage.getByLabel('Тип события').selectOption({ label: 'Передача владения' })

  // Две последние записи — туда и обратно; автор — тот, кто передавал; в данных только id и via
  const rows = ownerPage.getByRole('row').filter({ hasText: 'Передача владения' })
  await expect(rows.nth(1)).toBeVisible()
  const back = rows.nth(0)
  const there = rows.nth(1)
  await expect(back.getByRole('cell').nth(2)).toHaveText('E2E Администратор')
  await expect(there.getByRole('cell').nth(2)).toHaveText('E2E Владелец')

  for (const [row, from, to] of [
    [back, adminId, ownerId],
    [there, ownerId, adminId],
  ] as const) {
    const details = JSON.parse((await row.getByRole('cell').nth(4).innerText()).trim())
    expect(details).toEqual({ from_user_id: from, to_user_id: to, via: 'admin_panel' })
  }
  // Ни email, ни имён в записях
  for (const row of [back, there]) {
    const details = row.getByRole('cell').nth(4)
    await expect(details).not.toContainText('@')
    await expect(details).not.toContainText('E2E')
  }
})
