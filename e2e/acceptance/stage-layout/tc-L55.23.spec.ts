import { expect, test } from '@playwright/test'
import { authFile, pageAs } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, collapseButton, expandButton, loaded, openSpace, PRODUCT, scrollToBoard } from './rows'

/**
 * ТК-L55.23 (ADR-0008): у участника в режиме «только свои карточки» счётчик свёрнутой доски — по его карточкам, не
 * выдаёт, сколько на доске чужих; развёрнутая доска показывает те же карточки. «Разработка» демо-данных → RFOLD
 * «Сворачивание приёмки» (E2eSeeder): на «Продукте» 42 карточки, из них 2 — подрядчика; Жанна → e2e-restricted, Анна
 * → e2e-admin. В конце доска развёрнута.
 */
test.use({ storageState: authFile('e2e-restricted@selen.test'), viewport: LAPTOP })

const SPACE = ['RFOLD', 'Сворачивание приёмки'] as const
const CARDS = /^Открыть RFOLD-\d+: /

test('ТК-L55.23. «Только свои карточки»: счётчик свёрнутой доски — по своим карточкам @tc-L55.23', async ({ page, browser }) => {
  await openSpace(page, ...SPACE)
  await scrollToBoard(page, PRODUCT, 16)
  await loaded(page, PRODUCT)
  const own = block(page, PRODUCT).getByRole('button', { name: CARDS })
  await expect(own).toHaveCount(2)
  const names = await own.evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')).sort())

  // 1. Свернуть «Продукт» — «Продукт · 2 карточки»
  await collapseButton(page, PRODUCT).click()
  await expect(expandButton(page, PRODUCT)).toHaveAttribute('aria-expanded', 'false')
  const header = block(page, PRODUCT).locator('header').first()
  await expect(header).toContainText('Продукт')
  await expect(header).toContainText('· 2 карточки')

  // У Анны на той же доске — все карточки (42)
  const anna = await pageAs(browser, 'e2e-admin@selen.test')
  await openSpace(anna, ...SPACE)
  await scrollToBoard(anna, PRODUCT, 16)
  await loaded(anna, PRODUCT)
  await expect(block(anna, PRODUCT).getByRole('button', { name: CARDS })).toHaveCount(42)
  await anna.context().close()

  // 2. Развернуть «Продукт» — те же 2 карточки
  await expandButton(page, PRODUCT).click()
  await loaded(page, PRODUCT)
  await expect(own).toHaveCount(2)
  expect(await own.evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')).sort())).toEqual(names)
})
