import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { param, toastCount, toastsSince, trackToasts } from '../stage-ui1/helpers'
import { DESKTOP, openCardByKey } from '../stage-ux2/helpers'

/**
 * ТК-L112.1 (LATER-112): в списке ответственного подсвечен текущий ответственный, а не первый пункт «Снять
 * ответственного»; Enter сразу после открытия ничего не меняет. Анна → e2e-editor, DEV-41 (ответственный Борис Петров) →
 * UXC-1 «Как DEV-41», ответственный — «E2E Администратор» (E2eSeeder::uxBatch3; тест снимает ответственного).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L112.1. Выбор ответственного: подсвечен текущий, Enter ничего не меняет @tc-L112.1', async ({ page }) => {
  // 1. Открыть карточку: ответственный — «E2E Администратор»
  const window = await openCardByKey(page, 'UXC-1', 'Как DEV-41')
  await trackToasts(page)
  const main = window.getByRole('region', { name: 'Основные параметры' })
  const responsible = main.getByRole('button', { name: 'E2E Администратор — ответственный' })
  await expect(responsible).toBeVisible()

  // 2. Щёлкнуть ответственного в строке «Ответственный» — открылся список
  await responsible.click()
  const options = page.getByRole('option')
  // Список людей загружается при открытии — ждём людей
  await expect(options.filter({ hasText: 'E2E Редактор' })).toBeVisible()
  const names = await options.allTextContents()
  expect(names[0], 'первым по-прежнему стоит «Снять ответственного»').toBe('Снять ответственного')
  // Подсвечен (выделен для Enter) текущий ответственный с галочкой — «— выбран», а не первый пункт
  const highlighted = page.getByRole('option', { selected: true })
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toHaveAccessibleName('E2E Администратор — выбран')
  // Подсветка видна: фон подсвеченного пункта не такой, как у «Снять ответственного»
  const background = (option: typeof highlighted) => option.evaluate((e) => getComputedStyle(e).backgroundColor)
  expect(await background(highlighted), 'серый фон подсвеченного').not.toBe(await background(options.first()))

  // 3. Не двигая мышь, Enter: список закрылся, ответственный тот же, «Сохранено» нет, изменений на сервер не ушло
  const changes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/')) {
      changes.push(`${request.method()} ${request.url()}`)
    }
  })
  const from = await toastCount(page)
  await page.keyboard.press('Enter')
  await expect(options).toHaveCount(0)
  await expect(responsible).toBeVisible()
  await expect(param(main, 'Ответственный')).toContainText('E2E Администратор')
  // Сохранение ушло бы сразу после Enter — даём ему время и убеждаемся, что его не было
  await page.waitForTimeout(500)
  expect(changes, 'Enter ничего не отправил на сервер').toEqual([])
  expect(await toastsSince(page, from), 'уведомления «Сохранено» нет').not.toContain('Сохранено')

  // 4. Снова открыть список и щёлкнуть «Снять ответственного» — ответственного нет («Назначить»)
  await responsible.click()
  await expect(options.filter({ hasText: 'E2E Редактор' })).toBeVisible()
  await page.getByRole('option', { name: 'Снять ответственного' }).click()
  await expect(param(main, 'Ответственный')).toHaveText('Назначить')
})
