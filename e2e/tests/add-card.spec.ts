import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * «+ Карточка» на доске (LATER-44). Колонка Code Review доски «Процесс» пуста в E2eSeeder и другим тестам
 * не нужна — тест сам наполняет её и проверяет порядок.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('«+» в заголовке — карточка наверху; кнопка под последней — по наведению и с клавиатуры, карточка внизу', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')
  const cell = page.getByRole('group', { name: 'Code Review', exact: true })
  const add = cell.getByRole('button', { name: 'Добавить карточку в Code Review' })
  const titles = () => cell.getByRole('button', { name: /^Открыть QA-\d+: / })

  // Пустая ячейка — кнопка видна сразу
  await expect(add).toHaveCSS('opacity', '1')

  // «+» в заголовке: первая карточка
  await page.getByRole('button', { name: 'Добавить карточку в начало Code Review' }).click()
  await page.getByRole('textbox', { name: 'Добавить карточку в начало Code Review' }).fill('Средняя')
  await page.keyboard.press('Enter')
  await expect(titles()).toHaveCount(1)
  await page.keyboard.press('Escape')

  // В ячейке с карточкой кнопка скрыта; наведение на зону под карточкой её показывает, уход — прячет
  await page.getByRole('heading', { name: 'Процесс' }).hover()
  await expect(add).toHaveCSS('opacity', '0')
  await add.hover()
  await expect(add).toHaveCSS('opacity', '1')
  await page.getByRole('heading', { name: 'Процесс' }).hover()
  await expect(add).toHaveCSS('opacity', '0')

  // С клавиатуры: Tab с последней карточки — на кнопку, она видна
  await titles().last().focus()
  await page.keyboard.press('Tab')
  await expect(add).toBeFocused()
  await expect(add).toHaveCSS('opacity', '1')

  // Кнопка под последней карточкой — карточка в конец
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: 'Добавить карточку в Code Review' }).fill('Нижняя')
  await page.keyboard.press('Enter')
  await expect(titles()).toHaveCount(2)
  await page.keyboard.press('Escape')

  // «+» в заголовке ещё раз — карточка встаёт наверх
  await page.getByRole('button', { name: 'Добавить карточку в начало Code Review' }).click()
  await page.getByRole('textbox', { name: 'Добавить карточку в начало Code Review' }).fill('Верхняя')
  await page.keyboard.press('Enter')
  await expect(titles()).toHaveCount(3)

  // Порядок — и после перезагрузки (его хранит сервер)
  await page.reload()
  const after = page.getByRole('group', { name: 'Code Review', exact: true })
  await expect(after.getByRole('button', { name: /^Открыть QA-\d+: / })).toHaveText([
    /Верхняя/,
    /Средняя/,
    /Нижняя/,
  ])
})

const LONG_LANE = 'Очень длинное название дорожки для проверки многоточия в форме'

test('форма «+» в заголовке: отступы 12 px, стрелка дорожки не у края, многоточие, не шире колонки (LATER-49)', async ({ page }, testInfo) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Дорожки')

  // Обычная колонка, подколонка и узкий экран (телефон): одинаковые отступы и форма в пределах ячейки
  for (const [column, shot, width] of [
    ['To Do', 'later-49-column', 1280],
    ['Разработка', 'later-49-subcolumn', 1280],
    ['Done', 'later-49-narrow-screen', 375],
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    await page.getByRole('button', { name: `Добавить карточку в начало ${column}` }).click()
    await page.getByRole('combobox', { name: 'Дорожка' }).selectOption({ label: LONG_LANE })
    const field = page.getByRole('textbox', { name: `Добавить карточку в начало ${column}` })
    await field.fill('Проверка отступов')
    const form = field.locator('..')

    const m = await form.evaluate((el) => {
      const rect = (q: Element | null) => q!.getBoundingClientRect()
      const box = rect(el)
      const cell = rect(el.closest('[role="group"]'))
      const textarea = el.querySelector('textarea')!
      const value = el.querySelector<HTMLElement>('[data-slot="lane-value"]')!
      const buttons = [...el.querySelectorAll('button')]
      return {
        fieldLeft: rect(textarea).left + parseFloat(getComputedStyle(textarea).paddingLeft) - box.left,
        laneLeft: rect(value).left - box.left,
        chevronRight: box.right - rect(el.querySelector('[data-slot="lane-chevron"]')).right,
        buttonsRight: box.right - rect(buttons.at(-1)!).right,
        ellipsis: getComputedStyle(value).textOverflow === 'ellipsis' && value.scrollWidth > value.clientWidth,
        inside: box.left >= cell.left && box.right <= cell.right,
      }
    })

    expect(m.laneLeft, column).toBeCloseTo(m.fieldLeft, 0)
    expect(m.buttonsRight, column).toBeCloseTo(m.fieldLeft, 0)
    expect(m.chevronRight, column).toBeGreaterThanOrEqual(12)
    expect(m.ellipsis, column).toBe(true)
    expect(m.inside, column).toBe(true)
    await form.screenshot({ path: testInfo.outputPath(`${shot}.png`) })

    await page.getByRole('button', { name: `Отмена создания карточки в ${column}` }).click()
  }
})
