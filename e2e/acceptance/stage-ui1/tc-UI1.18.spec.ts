import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard } from './helpers'

/**
 * ТК-UI1.18: внизу окна — вкладки «Комментарии» (открыта, видны комментарии; новый — последним) и «История» (лента
 * изменений — перемещения и правки, новые сверху). Карточка с комментариями из Done → WIN-1 «Готовая
 * с комментариями» (E2eSeeder: два комментария, перенесена из To Do в Done); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const TEXT = 'ТК-UI1.18: новый комментарий'

test('ТК-UI1.18. Вкладки «Комментарии» и «История» @tc-UI1.18', async ({ page }) => {
  // 1. Открыть карточку с комментариями, прокрутить окно вниз — открыта вкладка «Комментарии», комментарии видны
  const window = await openCard(page, 'Готовая с комментариями')
  const commentsTab = window.getByRole('tab', { name: 'Комментарии' })
  await commentsTab.scrollIntoViewIfNeeded()
  await expect(commentsTab).toHaveAttribute('aria-selected', 'true')
  const comments = window.getByRole('tabpanel', { name: 'Комментарии' })
  await expect(comments.getByText('Первый комментарий')).toBeVisible()
  await expect(comments.getByText('Второй комментарий')).toBeVisible()

  // 2. Написать комментарий, отправить — он последним
  await comments.getByRole('textbox', { name: 'Новый комментарий' }).click()
  await page.keyboard.type(TEXT)
  await comments.getByRole('button', { name: 'Отправить' }).click()
  const items = comments.getByRole('listitem')
  await expect(items.last()).toContainText(TEXT)
  await expect(items.first()).toContainText('Первый комментарий')

  // 3. Вкладка «История» — лента: перемещения и правки, новые сверху
  await window.getByRole('tab', { name: 'История' }).click()
  const history = window
    .getByRole('tabpanel', { name: 'История' })
    .getByRole('list', { name: 'История' })
  const entries = history.getByRole('listitem')
  await expect(entries.first()).toContainText('Комментарий добавлен')
  await expect(history).toContainText('To Do → Done')
  await expect(entries.last()).toContainText('Создана в «To Do»')
})
