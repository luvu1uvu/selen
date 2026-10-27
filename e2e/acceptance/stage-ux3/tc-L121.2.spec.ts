import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { colorsOf, over } from '../stage-L91/helpers'
import { chooseTheme, isDark, luminance, resetTheme } from '../stage-RD2/helpers'
import { DESKTOP } from '../stage-ux2/helpers'
import { BOARD, SPACE, tile } from './helpers'

/**
 * ТК-L121.2 (U-7 «Редизайна», решение PM 27.10): в светлой теме при наведении под заблокированной карточкой появляется
 * лёгкая тень, как у обычной, красная рамка не меняется; в тёмной у заблокированной при наведении ничего не меняется,
 * у обычной рамка светлеет. Анна → e2e-admin (администратор UXC): тест переключает тему на сервере, как тесты RD2, и в
 * конце возвращает «Светлую». Карточки — UXC-5 «Заблокированная» и UXC-6 «Обычная» (E2eSeeder::uxBatch3).
 *
 * Тень и рамка проверяются вычисленными стилями фасада карточки и снимком полосы под карточкой (тень видна); насколько
 * тень «лёгкая» — только вручную.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test.afterEach(async ({ browser }) => {
  await resetTheme(browser, 'e2e-admin@selen.test', 'light')
})

/** Фасад карточки (у него рамка и тень) — внутри кнопки «Открыть …». */
const face = (page: Page, title: string) => tile(page, title).locator(':scope > div')

/** Тень sm (при наведении): два слоя, первый — 0 1px 3px; без наведения — xs (0 1px 2px). */
const SHADOW_SM = '0px 1px 3px 0px'

/** Вид фасада: тень, рамка (все стороны и кольцо) и видимый цвет верхней рамки поверх фона под карточкой. */
async function look(face: Locator) {
  const style = await face.evaluate((element) => {
    const s = getComputedStyle(element)
    return {
      shadow: s.boxShadow,
      border: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor].join(' | '),
    }
  })
  const colors = await colorsOf(face)
  return { ...style, borderSeen: luminance(over(colors.border, colors.under)) }
}

/** Снимок полосы сразу под карточкой — там видна её тень. */
async function underCard(page: Page, face: Locator) {
  const box = (await face.boundingBox())!
  const clip = { x: Math.round(box.x), y: Math.round(box.y + box.height), width: Math.round(box.width), height: 4 }
  return page.screenshot({ clip })
}

/** Указатель — в сторону (на полосу дерева слева внизу): ни одна карточка не под ним. */
const away = (page: Page) => page.mouse.move(2, DESKTOP.height - 2)

test('ТК-L121.2. Тень при наведении — и у заблокированной карточки @tc-L121.2', async ({ page }) => {
  // 1. На доске «Продукт» — карточка с пометкой «Заблокирована»; тема светлая
  await openHome(page)
  await openBoard(page, SPACE, BOARD)
  expect(await isDark(page), 'тема — светлая').toBe(false)
  await expect(tile(page, 'Заблокированная')).toContainText('Заблокирована')
  await expect(tile(page, 'Обычная')).not.toContainText('Заблокирована')

  // 2. Навести и увести указатель — у заблокированной и у обычной: при наведении появляется тень, рамка не меняется
  for (const title of ['Заблокированная', 'Обычная']) {
    const card = face(page, title)
    await card.scrollIntoViewIfNeeded()
    await away(page)
    const before = await look(card)
    const shotBefore = await underCard(page, card)
    expect(before.shadow, `${title}: без наведения тени sm нет`).not.toContain(SHADOW_SM)

    await card.hover()
    await expect.poll(async () => (await look(card)).shadow, `${title}: при наведении — тень`).toContain(SHADOW_SM)
    const hovered = await look(card)
    expect(hovered.border, `${title}: рамка при наведении не меняется`).toBe(before.border)
    expect((await underCard(page, card)).equals(shotBefore), `${title}: под карточкой видна тень`).toBe(false)

    await away(page)
    await expect
      .poll(async () => (await look(card)).shadow, `${title}: увели указатель — тени нет`)
      .not.toContain(SHADOW_SM)
  }

  // 3. Меню пользователя → «Тёмная»: у заблокированной при наведении ничего не меняется, у обычной рамка светлеет
  await chooseTheme(page, 'dark')
  await page.keyboard.press('Escape')
  await expect.poll(() => isDark(page), 'тема — тёмная').toBe(true)
  const blocked = face(page, 'Заблокированная')
  await away(page)
  const blockedBefore = await look(blocked)
  await blocked.hover()
  // Наведение применяется сразу (без перехода) — даём кадр и сравниваем
  await expect.poll(() => blocked.evaluate((e) => e.matches(':hover'))).toBe(true)
  expect(await look(blocked), 'тёмная: заблокированная при наведении не меняется (рамка красная, без тени)').toEqual(
    blockedBefore,
  )

  const normal = face(page, 'Обычная')
  await away(page)
  const normalBefore = await look(normal)
  await normal.hover()
  await expect
    .poll(async () => (await look(normal)).borderSeen, 'тёмная: у обычной рамка при наведении светлеет')
    .toBeGreaterThan(normalBefore.borderSeen)
  expect((await look(normal)).shadow, 'тёмная: тени нет').not.toContain(SHADOW_SM)

  // Вернуть «Светлую» (на сервере её вернёт и afterEach)
  await away(page)
  await chooseTheme(page, 'light')
  await page.keyboard.press('Escape')
  await expect.poll(() => isDark(page), 'тема снова светлая').toBe(false)
})
