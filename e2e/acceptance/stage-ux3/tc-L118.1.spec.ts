import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { DESKTOP } from '../stage-ux2/helpers'

/**
 * ТК-L118.1 (LATER-118): доступное имя кнопки меню пользователя начинается с видимого на ней имени — «E2E Редактор,
 * меню пользователя» (Анна → e2e-editor). Что прочитает VoiceOver, скрипт не слышит — проверяется доступное имя и роль
 * (их диктор и читает); прослушивание — только вручную.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L118.1. Кнопка меню пользователя называется видимым именем @tc-L118.1', async ({ page }) => {
  await openHome(page)
  const menu = page.getByRole('banner').getByRole('button', { name: 'E2E Редактор, меню пользователя', exact: true })
  await expect(menu).toBeVisible()
  // На кнопке написано имя
  await expect(menu).toContainText('E2E Редактор')
  const box = (await menu.boundingBox())!
  expect(box.x + box.width / 2, 'кнопка — справа в шапке').toBeGreaterThan(DESKTOP.width / 2)

  // 1. Нажимать Tab, пока фокус не встанет на кнопку с именем
  const focused = () => menu.evaluate((element) => element === document.activeElement)
  for (let presses = 0; presses < 150 && !(await focused()); presses++) await page.keyboard.press('Tab')
  await expect(menu).toBeFocused()

  // 2. Диктор читает доступное имя и роль: имя — первым, затем «меню пользователя»; роль — кнопка
  // Видимое на кнопке имя (последняя строка: перед ним — буква в кружке) — в начале доступного
  const visible = (await menu.innerText()).split('\n').at(-1)!.trim()
  expect(visible, 'видимое имя на кнопке').toBe('E2E Редактор')
  await expect(menu).toHaveAccessibleName(`${visible}, меню пользователя`)
})
