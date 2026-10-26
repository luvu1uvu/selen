import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { COMPANY_1, NO_CARD, NO_SPACE } from './helpers'

/**
 * ТК-R2.13: по ссылке нельзя узнать, существует ли чужая карточка или пространство и в какой они компании. kirill@
 * (сотрудник «Компании 2») → e2e-multi-admin (администратор «E2E Компании 2» и «E2E Компании 3», в «Компании 1» его
 * нет); «Разработка» → QA «Сквозные тесты», DEV-1 → QA-1 «Существующая задача». zhanna@ («только свои карточки»
 * в «Разработке») → e2e-restricted, editor QA «только свои» (своя — QA-2, QA-1 не её), доска «Процесс».
 */

test('ТК-R2.13. Ссылка на недоступное — главная и уведомление @tc-R2.13', async ({ browser }) => {
  // 1. Сотрудник другой компании: чужая карточка — главная и уведомление
  const stranger = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await stranger.goto('/cards/QA-1')
  await expect(stranger.getByText(NO_CARD)).toBeVisible()
  await expect(stranger).toHaveURL(/\/$/)
  await expect(stranger.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await expect(stranger.getByRole('dialog')).toHaveCount(0)
  await expect(stranger.getByText('Существующая задача')).toHaveCount(0)

  // 2. Несуществующая карточка — то же уведомление
  await stranger.goto('/cards/QA-99999')
  await expect(stranger.getByText(NO_CARD)).toBeVisible()
  await expect(stranger).toHaveURL(/\/$/)
  await expect(stranger.getByRole('dialog')).toHaveCount(0)

  // 3. Чужое пространство — главная, уведомление о пространстве
  await stranger.goto('/spaces/QA')
  await expect(stranger.getByText(NO_SPACE)).toBeVisible()
  await expect(stranger).toHaveURL(/\/$/)
  // Названий карточки, пространства и компании, где они лежат, нигде нет
  for (const text of ['Существующая задача', 'Сквозные тесты', COMPANY_1]) {
    await expect(stranger.getByText(text), text).toHaveCount(0)
  }

  // 4. «Только свои карточки»: чужая карточка в открытом пространстве — пространство остаётся, окна нет, уведомление
  const restricted = await pageAs(browser, 'e2e-restricted@selen.test')
  await restricted.goto('/spaces/QA/cards/QA-1')
  await expect(restricted.getByText(NO_CARD)).toBeVisible()
  await expect(restricted).toHaveURL(/\/spaces\/QA$/)
  await expect(restricted.getByRole('heading', { name: 'Процесс', exact: true })).toBeVisible()
  await expect(restricted.getByRole('button', { name: /^Открыть QA-2: / })).toBeVisible()
  await expect(restricted.getByRole('dialog')).toHaveCount(0)
  await expect(restricted.getByText('Существующая задача')).toHaveCount(0)
})
