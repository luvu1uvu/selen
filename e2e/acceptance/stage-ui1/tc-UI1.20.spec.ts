import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { BOARD, copiedText, openCard, SPACE, stubClipboard, tile } from './helpers'

/**
 * ТК-UI1.20: в режиме «только свои карточки» чужая карточка по ссылке не открывается — «Карточка не найдена», ни
 * названия, ни содержимого; своя открывается как обычно. Анна → e2e-editor, Жанна → e2e-restricted (во втором
 * браузерном контексте — как окно инкогнито); пространство WIN: чужая для Жанны — WIN-17 «Чужая для подрядчика», своя
 * (она ответственная) — WIN-16 «Своя карточка подрядчика» (E2eSeeder).
 * С «Прав 2.0», П2b-2 ссылка на недоступную карточку ведёт на главную с уведомлением «Нет доступа к карточке или она
 * не существует» (вместо «Карточка не найдена») — проверка та же: ни названия, ни содержимого, окна нет.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.20. «Только свои карточки» — чужая по ссылке не открывается @tc-UI1.20', async ({
  page,
  browser,
}) => {
  // 1. Анна: открыть карточку, где Жанна не заказчик, не ответственная и не участник; «⋯» → «Скопировать ссылку»
  await stubClipboard(page)
  const window = await openCard(page, 'Чужая для подрядчика')
  await window.getByRole('button', { name: 'Действия с карточкой «Чужая для подрядчика»' }).click()
  await page.getByRole('menuitem', { name: 'Скопировать ссылку' }).click()
  await expect(page.getByText('Ссылка скопирована')).toBeVisible()
  const link = (await copiedText(page))!
  expect(link).toMatch(/\/cards\/WIN-\d+$/)

  // 2. Жанна: вставить ссылку — главная и «нет доступа», ни названия, ни содержимого
  const zhanna = await (
    await browser.newContext({ storageState: authFile('e2e-restricted@selen.test') })
  ).newPage()
  await zhanna.goto(link)
  await expect(zhanna.getByText('Нет доступа к карточке или она не существует')).toBeVisible()
  await expect(zhanna).toHaveURL(/\/$/)
  await expect(zhanna.getByText('Чужая для подрядчика')).toHaveCount(0)
  await expect(zhanna.getByRole('dialog')).toHaveCount(0)

  // 3. Жанна: открыть свою карточку на доске — окно открывается как обычно
  await openHome(zhanna)
  await openBoard(zhanna, SPACE, BOARD)
  await expect(tile(zhanna, 'Чужая для подрядчика')).toHaveCount(0)
  await tile(zhanna, 'Своя карточка подрядчика').click()
  const own = zhanna.getByRole('dialog', { name: 'Своя карточка подрядчика' })
  await expect(own).toBeVisible()
  await expect(own.getByRole('region', { name: 'Основные параметры' })).toContainText(
    'E2E Подрядчик',
  )
})
