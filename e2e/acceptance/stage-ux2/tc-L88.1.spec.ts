import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { ringOf } from '../stage-L91/helpers'
import { expectHint, moveMouseAway } from '../stage-ux1/helpers'
import { DESKTOP } from './helpers'
import { tree } from './tree'

/**
 * ТК-L88.1 (LATER-88): значок «доступно всем» у пространства — подсказка «Доступно всем сотрудникам» и по наведению,
 * и с клавиатуры (Tab со строки — на значок, рамка фокуса). «Компания» (открыто группе «Все сотрудники») → QA «Сквозные
 * тесты»: «доступно всем» в E2E-данных ни у кого нет (группа «Все сотрудники» открыла бы пространство всем
 * пользователям тестов) — пометку ставит подменённый ответ дерева, как в tree-row.spec. Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

const SPACE = 'Сквозные тесты'
const HINT = 'Доступно всем сотрудникам'

type Node = { space?: { name: string }; everyone: boolean; children?: Node[] }

/** Пространство QA в ответе дерева — «доступно всем». */
async function markEveryone(page: Page) {
  await page.route('**/api/v1/navigation', async (route) => {
    const response = await route.fetch()
    // Ответ — деревья по компаниям (ADR-0024, П2b-2)
    const body = (await response.json()) as { data: { items: Node[] }[] }
    const mark = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.space?.name === SPACE) node.everyone = true
        mark(node.children ?? [])
      }
    }
    body.data.forEach((company) => mark(company.items))
    await route.fulfill({ response, json: body })
  })
}

test('ТК-L88.1. «Доступно всем» — подсказка мышью и с клавиатуры @tc-L88.1', async ({ page }) => {
  await markEveryone(page)
  await page.goto('/')
  const nav = tree(page)
  const row = nav.getByRole('link', { name: SPACE, exact: true })
  const mark = nav.getByRole('img', { name: HINT })
  await expect(mark).toBeVisible()

  // 1. Навести указатель на значок — подсказка «Доступно всем сотрудникам»
  await mark.hover()
  await expectHint(page, HINT)
  await moveMouseAway(page)

  // 2. Щёлкнуть строку пространства, затем Tab — на стрелку раскрытия, ещё Tab — фокус (рамка) на значке, подсказка
  // видна. Тест-кейс уточнён по U-4 UX-ревью пачки UX-2: порядок Tab — как на экране (стрелка левее значка), а писался
  // при прежнем порядке «строка → значок → стрелка»
  await row.click()
  await expect(page).toHaveURL(/\/spaces\/QA/)
  await expect(row).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: /^(Раскрыть|Свернуть) «Сквозные тесты»$/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(mark).toBeFocused()
  expect(await ringOf(mark), 'рамка фокуса у значка').not.toBeNull()
  await expectHint(page, HINT)
})
