import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import {
  arrowTo,
  block,
  DUTY,
  focused,
  INFRA,
  layout,
  loaded,
  moveResponse,
  openSpace,
  PRODUCT,
  START_LAYOUT,
  WIDE,
} from './rows'

/**
 * ТК-L55.22 (решение PM 6): доски переставляются без мыши. Tab до «⋯» в шапке «Широкой доски», Enter, стрелками до
 * «Переставить», стрелка вправо — подменю «Левее», «Правее», «В ряд выше», «В ряд ниже», «Отдельным рядом»
 * (недоступные — серые); «Левее» + Enter — «Широкая доска» первой в ряду; «Правее» — обратно; «Инфраструктура»
 * «В ряд выше» — в ряд к «Продукту» справа, «Отдельным рядом» — снова отдельным рядом под ним. «Разработка»
 * демо-данных → RKEYS «Клавиатура приёмки» (E2eSeeder), Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RKEYS', 'Клавиатура приёмки'] as const
const ITEMS = ['Левее', 'Правее', 'В ряд выше', 'В ряд ниже', 'Отдельным рядом']

/** В открытом меню «⋯»: «Переставить», стрелка вправо — подменю; пункт подменю + Enter. */
async function arrangeWithKeys(page: Page, item: string) {
  await arrowTo(page, 'Переставить')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menuitem', { name: item, exact: true })).toBeVisible()
  await arrowTo(page, item)
  const moved = moveResponse(page)
  await page.keyboard.press('Enter')
  expect((await moved).ok()).toBe(true)
}

test('ТК-L55.22. Перестановка доски с клавиатуры @tc-L55.22', async ({ page }) => {
  await openSpace(page, ...SPACE)
  await loaded(page, DUTY)
  await loaded(page, WIDE)
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)

  // 1. Tab, пока рамка фокуса не окажется на «⋯» в шапке «Широкой доски»; Enter
  const menu = `Действия с доской «${WIDE}»`
  for (let i = 0; i < 150 && (await focused(page)) !== menu; i++) await page.keyboard.press('Tab')
  expect(await focused(page)).toBe(menu)
  const button = block(page, WIDE).getByRole('button', { name: menu })
  expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  await page.keyboard.press('Enter')

  // 2. Стрелками до «Переставить», стрелка вправо — подменю из пяти пунктов, недоступные серые
  await arrowTo(page, 'Переставить')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focused(page)).toBe('Левее')
  const sub = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: 'Отдельным рядом' }) }).last()
  await expect(sub.getByRole('menuitem')).toHaveText(ITEMS)
  const state = await sub.getByRole('menuitem').evaluateAll((items) =>
    items.map((item) => ({
      name: item.textContent,
      disabled: item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('data-disabled'),
      opacity: Number(getComputedStyle(item).opacity),
    })),
  )
  // «Широкая доска» — справа в первом ряду: «Правее» и «В ряд выше» недоступны и серые
  const disabled = state.filter((item) => item.disabled).map((item) => item.name)
  expect(disabled).toEqual(['Правее', 'В ряд выше'])
  for (const item of state) expect(item.opacity < 1, item.name!).toBe(item.disabled)
  // «Левее», Enter — «Широкая доска» первой в ряду, слева от «Дежурства»
  await arrowTo(page, 'Левее')
  const moved = moveResponse(page)
  await page.keyboard.press('Enter')
  expect((await moved).ok()).toBe(true)
  await expect.poll(() => layout(page)).toEqual([[WIDE, DUTY], ...START_LAYOUT.slice(1)])

  // 3. Так же у «Широкой доски»: «⋯» → «Переставить» → «Правее» — снова «Дежурства», «Широкая доска»
  await button.focus()
  await page.keyboard.press('Enter')
  await arrangeWithKeys(page, 'Правее')
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)

  // 4. У «Инфраструктуры»: «В ряд выше» — в ряд к «Продукту» справа; затем «Отдельным рядом» — снова под ним
  const infraMenu = block(page, INFRA).getByRole('button', { name: `Действия с доской «${INFRA}»` })
  await infraMenu.focus()
  await page.keyboard.press('Enter')
  await arrangeWithKeys(page, 'В ряд выше')
  await expect.poll(() => layout(page)).toEqual([[DUTY, WIDE], [PRODUCT, INFRA]])
  await infraMenu.focus()
  await page.keyboard.press('Enter')
  await arrangeWithKeys(page, 'Отдельным рядом')
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
})
