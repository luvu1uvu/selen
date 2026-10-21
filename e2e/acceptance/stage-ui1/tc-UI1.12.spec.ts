import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, PNG_BASE64 } from './helpers'

/**
 * ТК-UI1.12: «+» → «Файл…» сразу открывает выбор файла; после загрузки — уведомление и секция «Файлы» с превью
 * картинки; щелчок по превью открывает картинку крупно. Новая карточка без файлов → WIN-6 «Для файла из меню»
 * (E2eSeeder); Анна → e2e-editor; картинка с компьютера — PNG, выбранный в окне выбора файла (Playwright).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const NAME = 'картинка-ТК-UI1.12.png'

test('ТК-UI1.12. «+» → «Файл» @tc-UI1.12', async ({ page }) => {
  const window = await openCard(page, 'Для файла из меню')
  await expect(window.getByRole('region', { name: 'Файлы' })).toHaveCount(0)

  // 1. «+» → «Файл…» — сразу открылся выбор файла; выбрать картинку
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Файл…' }).click()
  await (
    await chooser
  ).setFiles({ name: NAME, mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })

  // Уведомление о загрузке, секция «Файлы» с превью картинки
  await expect(page.getByText(`Файл «${NAME}» приложен`)).toBeVisible()
  const files = window.getByRole('region', { name: 'Файлы' })
  const preview = files.getByRole('img', { name: NAME, exact: true })
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  const small = (await preview.boundingBox())!

  // Щелчок по превью открывает картинку крупно
  await files.getByRole('button', { name: `Открыть ${NAME}` }).click()
  const viewer = page.getByRole('dialog', { name: NAME })
  await expect(viewer).toBeVisible()
  const large = (await viewer.getByRole('img', { name: NAME }).boundingBox())!
  expect(large.width).toBeGreaterThan(small.width * 2)
})
