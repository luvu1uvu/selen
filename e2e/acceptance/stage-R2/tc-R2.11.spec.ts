import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { companyButton, openAdminPanel, tree, usersTabs } from './helpers'

/**
 * ТК-R2.11: у кого компания одна, названий компаний нигде нет; раздел «Пользователи» — с вкладками как в Kaiten.
 * admin@ → e2e-admin (администратор только «Компании 1»), boris@ → e2e-editor. Вкладки — ссылки со своими адресами
 * (уточнение 2 П2b-2): выбранная отмечена `aria-current="page"`. «Значок над подписью, выбранная подчёркнута» —
 * внешний вид, только вручную.
 */

/** Ни одного названия компании на экране: ни «Компания 1» демо, ни компаний E2E. */
async function expectNoCompanyNames(page: Page) {
  await expect(page.getByText(/Компания \d/)).toHaveCount(0)
}

/** Дерево — как раньше: без заголовков компаний. */
async function expectPlainTree(page: Page) {
  await expect(tree(page).getByRole('link').first()).toBeVisible()
  await expect(tree(page).getByRole('region')).toHaveCount(0)
  await expect(tree(page).getByRole('heading')).toHaveCount(0)
}

test('ТК-R2.11. У кого компания одна — названий компаний нигде нет; вкладки «Пользователей» @tc-R2.11', async ({
  browser,
}) => {
  // 1. Администратор одной компании: выбора компании нет, пункта «Группы» в меню нет
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  const panel = await openAdminPanel(admin)
  await expect(panel.getByRole('link', { name: 'Пользователи', exact: true })).toBeVisible()
  await expect(companyButton(admin)).toHaveCount(0)
  await expect(panel.getByRole('link', { name: 'Группы', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('link', { name: 'Компании', exact: true })).toHaveCount(0)

  // «Пользователи» — вкладки «Пользователи», «Группы», «Приглашения»; выбрана первая
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  const tabs = usersTabs(admin)
  await expect(tabs.getByRole('link')).toHaveText(['Пользователи', 'Группы', 'Приглашения'])
  await expect(tabs.getByRole('link', { name: 'Пользователи' })).toHaveAttribute('aria-current', 'page')
  await expectNoCompanyNames(admin)

  // Вкладка «Группы» — свой адрес, группы компании; заголовок раздела прежний
  await tabs.getByRole('link', { name: 'Группы' }).click()
  await expect(admin).toHaveURL(/\/admin\/c\/[^/]+\/groups$/)
  await expect(tabs.getByRole('link', { name: 'Группы' })).toHaveAttribute('aria-current', 'page')
  await expect(tabs.getByRole('link', { name: 'Пользователи' })).not.toHaveAttribute('aria-current', 'page')
  await expect(admin.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Создать группу' })).toBeVisible()
  await expect(admin.getByRole('row').filter({ hasText: 'Все сотрудники' })).toBeVisible()
  await expectNoCompanyNames(admin)

  // Вкладка «Приглашения» — свой адрес, список приглашений
  await tabs.getByRole('link', { name: 'Приглашения' }).click()
  await expect(admin).toHaveURL(/\/admin\/c\/[^/]+\/invitations$/)
  await expect(tabs.getByRole('link', { name: 'Приглашения' })).toHaveAttribute('aria-current', 'page')
  await expect(admin.getByRole('columnheader', { name: 'Состояние' })).toBeVisible()
  await expectNoCompanyNames(admin)

  // «Назад» — на предыдущую вкладку (у вкладок свои адреса)
  await admin.goBack()
  await expect(tabs.getByRole('link', { name: 'Группы' })).toHaveAttribute('aria-current', 'page')

  // 2. Дерево — как раньше, без заголовков компаний
  await admin.goto('/')
  const treeButton = admin.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Дерево' })
  await expect(treeButton).toBeVisible()
  if ((await treeButton.getAttribute('aria-pressed')) !== 'true') await treeButton.click()
  await expectPlainTree(admin)
  await expectNoCompanyNames(admin)

  // 3. Участник одной компании: дерево без заголовков, названий компаний нет
  const editor = await pageAs(browser, 'e2e-editor@selen.test')
  await expectPlainTree(editor)
  await expectNoCompanyNames(editor)
})
