import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, canvas, loaded, openSpace, PRODUCT, scrollToBoard } from './rows'

/**
 * ТК-L55.21 (LATER-55): карточка открывается поверх страницы пространства — доски под окном не прыгают, адрес
 * `…/spaces/KEY/cards/KEY-N`; после закрытия (Esc) видны те же карточки, адрес `…/spaces/KEY`. «Разработка»
 * демо-данных → RACC «Приёмка рядов» (E2eSeeder): «Продукт» — 40 карточек в To Do, выше окна; Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

/** Карточки «Продукта», которые сейчас видны на экране целиком. */
function visibleCards(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('section[aria-label="Продукт"] [aria-label^="Открыть RACC-"]')]
      .filter((card) => {
        const box = card.getBoundingClientRect()
        return box.top >= 220 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth
      })
      .map((card) => card.getAttribute('aria-label')),
  )
}

test('ТК-L55.21. Карточка открывается поверх пространства @tc-L55.21', async ({ page }) => {
  // 1. Прокрутить до «Продукта» и ниже на пару экранов, открыть видимую карточку
  await openSpace(page, 'RACC', 'Приёмка рядов')
  await scrollToBoard(page, PRODUCT, 0)
  await loaded(page, PRODUCT)
  await scrollToBoard(page, PRODUCT, -1500)
  await page.waitForTimeout(300)
  const before = { scroll: (await canvas(page)).scrollTop, cards: await visibleCards(page) }
  expect(before.cards.length).toBeGreaterThan(3)
  // По подписи, а не по роли: под открытым окном карточки страница скрыта от скринридеров (aria-hidden)
  const card = block(page, PRODUCT).locator(`[aria-label="${before.cards[0]}"]`)
  const cardBox = await card.boundingBox()
  const number = before.cards[0]!.match(/RACC-\d+/)![0]
  const title = before.cards[0]!.replace(/^Открыть RACC-\d+: /, '')
  await card.click()

  // 2. Окно карточки — поверх страницы, доски под ним не прыгнули; адрес …/spaces/RACC/cards/RACC-…
  await expect(page).toHaveURL(new RegExp(`/spaces/RACC/cards/${number}$`))
  const panel = page.getByRole('dialog', { name: title })
  await expect(panel).toBeVisible()
  expect((await canvas(page)).scrollTop).toBe(before.scroll)
  expect(await card.boundingBox()).toEqual(cardBox)

  // Закрыть окно (Esc): те же карточки на экране, адрес …/spaces/RACC
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).toHaveURL(/\/spaces\/RACC$/)
  expect((await canvas(page)).scrollTop).toBe(before.scroll)
  expect(await visibleCards(page)).toEqual(before.cards)
})
