import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { roleCell } from '../stage-3/helpers'
import { chooseCompany, COMPANY_1, COMPANY_2, openAdminPanel, SECOND_SPACE } from './helpers'

/**
 * ТК-R2.27: Владелец заранее видит, к каким пространствам потеряет доступ. owner@ → e2e-owner («дом» — только «Компания
 * 1»); «Компания 2» → «E2E Компания 2», «Продажи» → RSECOND «Вторая компания: продажи», «Анна Смирнова» → «E2E
 * Администратор». Владение не передаётся. В конце роль Владельца в RSECOND снимает её администратор e2e-multi-admin:
 * иначе у Владельца в дереве появилась бы вторая компания (seeder обещает дерево Владельца без неё) — и тест можно
 * повторить.
 */

test('ТК-R2.27. Передача владения предупреждает о доступе вне своих компаний @tc-R2.27', async ({ browser }) => {
  // 1. Администрирование → «E2E Компания 2» → «Пространства» → «⋯» у «Вторая компания: продажи» → «Назначить роль»:
  //    себе, «Редактор»
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  const panel = await openAdminPanel(owner)
  await chooseCompany(owner, COMPANY_2)
  await panel.getByRole('link', { name: 'Пространства', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Пространства', level: 1 })).toBeVisible()
  await owner.getByRole('button', { name: `Действия с пространством «${SECOND_SPACE}»` }).click()
  await owner.getByRole('menuitem', { name: 'Назначить роль' }).click()
  const assign = owner.getByRole('dialog', { name: `Назначить роль в «${SECOND_SPACE}»` })
  await assign.getByRole('button', { name: 'Назначить себе' }).click()
  await assign.getByLabel('Роль').selectOption({ label: 'Редактор' })
  await assign.getByRole('button', { name: 'Назначить', exact: true }).click()
  await expect(assign).toBeHidden()
  await expect(owner.getByText('Роль назначена')).toBeVisible()

  // 2. «Пользователи» «Компании 1» → «Передать владение» → «E2E Администратор»: предупреждение, не подтверждать
  await chooseCompany(owner, COMPANY_1)
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await owner.getByRole('button', { name: 'Передать владение' }).click()
  const dialog = owner.getByRole('dialog', { name: 'Передать владение' })
  await dialog.getByLabel('Новый Владелец').fill('E2E Адм')
  await dialog.getByRole('button', { name: /^E2E Администратор/ }).click()
  await expect(dialog).toContainText('Вы потеряете доступ к 1 пространству')
  await expect(dialog).toContainText(`${SECOND_SPACE} (RSECOND)`)
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
  // Владелец не изменился
  await expect(roleCell(owner, 'E2E Владелец')).toHaveText('Владелец')
  await expect(roleCell(owner, 'E2E Администратор')).toHaveText('Администратор')

  // Вернуть как было: администратор RSECOND исключает Владельца из пространства
  const admin = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await admin.goto('/spaces/RSECOND')
  await expect(admin.getByRole('heading', { name: SECOND_SPACE }).first()).toBeVisible()
  await admin.getByRole('tab', { name: 'Участники', exact: true }).click()
  await admin.getByRole('button', { name: 'Исключить E2E Владелец' }).click()
  const remove = admin.getByRole('dialog', { name: 'Исключить из пространства?' })
  await remove.getByRole('button', { name: 'Исключить', exact: true }).click()
  await expect(remove).toBeHidden()
  await expect(admin.getByRole('button', { name: 'Исключить E2E Владелец' })).toHaveCount(0)
})
