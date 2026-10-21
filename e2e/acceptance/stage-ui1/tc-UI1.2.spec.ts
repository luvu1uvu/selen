import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, canvas, loaded, PRODUCT, scrollToBoard } from '../stage-layout/rows'

/**
 * ТК-UI1.2: закрытие окна (Esc, щелчок по затемнению, ✕) возвращает на то же место доски — видны те же карточки,
 * страница не прыгнула, адрес — снова адрес страницы пространства. «Разработка» → «Продукт» демо-данных → RACC
 * «Приёмка рядов» → «Продукт» (40 карточек в To Do — выше окна); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

/** Карточки «Продукта», которые сейчас видны на экране целиком (ниже закреплённых заголовков). */
function visibleCards(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('section[aria-label="Продукт"] [aria-label^="Открыть RACC-"]')]
      .filter((card) => {
        const box = card.getBoundingClientRect()
        return (
          box.top >= 220 &&
          box.bottom <= window.innerHeight &&
          box.left >= 0 &&
          box.right <= window.innerWidth
        )
      })
      .map((card) => card.getAttribute('aria-label')!),
  )
}

test('ТК-UI1.2. Закрытие возвращает на то же место доски @tc-UI1.2', async ({ page }) => {
  // 1. Дерево → «Приёмка рядов» → «Продукт»; прокрутить вниз так, чтобы верх доски ушёл за экран
  await openHome(page)
  await openSpaceBoard(page, 'Приёмка рядов', PRODUCT)
  await loaded(page, PRODUCT)
  const spaceUrl = page.url()
  await scrollToBoard(page, PRODUCT, -900)
  await page.waitForTimeout(300)
  const productTop = (await block(page, PRODUCT).boundingBox())!.y
  expect(productTop).toBeLessThan(0)
  const before = { scroll: (await canvas(page)).scrollTop, cards: await visibleCards(page) }
  expect(before.cards.length).toBeGreaterThan(5)

  // 2–4. Три карточки по очереди: Esc, щелчок по затемнению мимо окна, ✕ в углу окна
  for (const [index, close] of (['Escape', 'outside', 'button'] as const).entries()) {
    const label = before.cards[index * 2]
    const title = label.replace(/^Открыть RACC-\d+: /, '')
    await block(page, PRODUCT).locator(`[aria-label="${label}"]`).click()
    const window = page.getByRole('dialog', { name: title })
    await expect(window).toBeVisible()
    await expect(page).toHaveURL(/\/spaces\/RACC\/cards\/RACC-\d+$/)

    if (close === 'Escape') await page.keyboard.press('Escape')
    else if (close === 'outside') {
      const box = (await window.boundingBox())!
      await page.mouse.click(box.x + box.width + 80, box.y + 300)
    } else await window.getByRole('button', { name: 'Закрыть' }).click()

    // Те же карточки на экране, страница не прыгнула вверх, адрес — снова …/spaces/RACC
    await expect(window).toBeHidden()
    expect(page.url(), close).toBe(spaceUrl)
    expect((await canvas(page)).scrollTop, close).toBe(before.scroll)
    expect(await visibleCards(page), close).toEqual(before.cards)
  }
})
