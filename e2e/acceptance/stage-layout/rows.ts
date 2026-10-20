import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Общие шаги приёмочных автотестов PR 3 пакета «Раскладка» (LATER-55, шаг 3; docs/stages/layout-package.md,
 * ТК-L55.12–L55.23): все доски пространства рядами на одной странице (ADR-0019).
 *
 * Данные E2eSeeder (acceptanceRows) — пространства, устроенные как «Разработка» демо-данных: ряды [«Дежурства» (две
 * колонки, 6 карточек в «Готово»), «Широкая доска» (14 колонок без карточек)], [«Продукт» (шаблон «Разработка», шире
 * окна)], [«Инфраструктура»]. RACC «Приёмка рядов» тесты только смотрят; RFOLD, RDRAG, RNEWROW, RKEYS, RARCH — меняют
 * сворачивание или раскладку, у каждого тест-кейса своё пространство, и тест возвращает всё как было. Пользователи
 * тест-кейсов: Анна (администратор пространства) — e2e-admin, Борис (editor) — e2e-editor, Жанна («только свои
 * карточки») — e2e-restricted.
 */

export const DUTY = 'Дежурства'
export const WIDE = 'Широкая доска'
export const PRODUCT = 'Продукт'
export const INFRA = 'Инфраструктура'

/** Раскладка из демо-данных и E2eSeeder: [«Дежурства», «Широкая доска»], [«Продукт»], [«Инфраструктура»]. */
export const START_LAYOUT = [[DUTY, WIDE], [PRODUCT], [INFRA]]

/** Блок доски на странице пространства (section с названием доски). */
export const block = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

/** Открыть страницу пространства по адресу; доски первого ряда грузятся сразу. */
export async function openSpace(page: Page, key: string, name: string) {
  await page.goto(`/spaces/${key}`)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  await expect(page.locator('[data-board-row]').first()).toBeVisible()
}

/** Доска загружена (не заглушка): у неё есть тело с колонками. */
export async function loaded(page: Page, name: string) {
  await expect(block(page, name).locator('[data-board-body]')).toBeVisible()
}

/** Раскладка, как видно на экране: ряды сверху вниз, в ряду — названия досок слева направо. */
export function layout(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-board-row]')].map((row) =>
      [...row.querySelectorAll('section[data-board-block]')]
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        .map((section) => section.getAttribute('aria-label')),
    ),
  )
}

/** Прямоугольник блока доски (координаты окна). */
export function rect(page: Page, name: string) {
  return page.evaluate((name) => {
    const box = document.querySelector(`section[aria-label="${name}"]`)!.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
  }, name)
}

/** Холст страницы пространства: его край на экране и вертикальная прокрутка. */
export function canvas(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-board-canvas]')!
    const box = canvas.getBoundingClientRect()
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      scrollTop: canvas.scrollTop,
      max: canvas.scrollHeight - canvas.clientHeight,
    }
  })
}

/**
 * Прокрутить холст так, чтобы верх доски оказался на `offset` px ниже верха холста. Блок ищется в момент прокрутки:
 * заглушку незагруженной доски React заменяет блоком доски, и найденный заранее элемент мог уже уйти из страницы.
 */
export async function scrollToBoard(page: Page, name: string, offset = 0) {
  await expect(block(page, name)).toBeAttached()
  await page.evaluate(
    ({ name, offset }) => {
      const section = document.querySelector(`section[aria-label="${name}"]`)!
      const canvas = document.querySelector('[data-board-canvas]')!
      canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top - offset
    },
    { name, offset },
  )
}

/** Насколько содержимое шире видимой части (прокрутка вбок внутри элемента). */
export function overflowX(locator: Locator) {
  return locator.evaluate((element) => element.scrollWidth - element.clientWidth)
}

/** Свернуть / развернуть доску стрелкой в её шапке. */
export const collapseButton = (page: Page, name: string) =>
  block(page, name).getByRole('button', { name: `Свернуть доску «${name}»` })
export const expandButton = (page: Page, name: string) =>
  block(page, name).getByRole('button', { name: `Развернуть доску «${name}»` })

/** Ответ перестановки доски (POST …/move). */
export const moveResponse = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')

/**
 * Взять доску за ⠿ и, не отпуская, плавно довести указатель до точки (как человек: перенос начинается после сдвига).
 * Кнопка мыши остаётся зажатой — отпускает тест.
 */
export async function grabBoard(page: Page, name: string, to: { x: number; y: number }) {
  const handle = block(page, name).locator('[data-board-handle]')
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 15 })
}

/** Отпустить доску и дождаться ответа перестановки. */
export async function dropBoard(page: Page) {
  const moved = moveResponse(page)
  await page.mouse.up()
  expect((await moved).ok()).toBe(true)
  await expect(page.locator('[data-board-drop]')).toHaveCount(0)
}

/** Точка над шапкой доски: левая или правая половина. */
export async function overHeader(page: Page, name: string, half: 'left' | 'right') {
  const header = (await block(page, name).locator('header').first().boundingBox())!
  return { x: header.x + header.width * (half === 'left' ? 0.25 : 0.75), y: header.y + header.height / 2 }
}

/** Подпись элемента в фокусе: aria-label, а без неё — текст (пункты меню). */
export const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')

/**
 * В открытом меню — стрелками вниз до пункта. Меню переводит фокус не сразу: после каждого нажатия ждём, пока фокус
 * перейдёт на следующий пункт.
 */
export async function arrowTo(page: Page, item: string) {
  const role = () => page.evaluate(() => document.activeElement?.getAttribute('role') ?? '')
  await expect.poll(role).toMatch(/^menu/)
  // Меню, открытое мышью, держит фокус на себе — первая стрелка вниз переводит его на первый пункт
  if ((await role()) === 'menu') {
    await page.keyboard.press('ArrowDown')
    await expect.poll(role).toMatch(/^menuitem/)
  }
  for (let i = 0; i < 12; i++) {
    const now = await focused(page)
    if (now === item) return
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focused(page)).not.toBe(now)
  }
  expect(await focused(page)).toBe(item)
}

/**
 * «⋯» доски → «Переставить» → пункт подменю (Enter). Меню открывается щелчком, подменю — стрелкой вправо, как с
 * клавиатуры (решение PM 6): мышью по диагонали к подменю Radix его закрывает.
 */
export async function arrange(page: Page, name: string, item: string) {
  await block(page, name).getByRole('button', { name: `Действия с доской «${name}»` }).click()
  await arrowTo(page, 'Переставить')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menuitem', { name: item, exact: true })).toBeVisible()
  await arrowTo(page, item)
  const moved = moveResponse(page)
  await page.keyboard.press('Enter')
  expect((await moved).ok()).toBe(true)
}
