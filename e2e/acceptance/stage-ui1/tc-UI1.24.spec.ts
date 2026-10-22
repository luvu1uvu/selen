import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { dropFile, openCard } from './helpers'

/**
 * ТК-UI1.24 (решение PM 2): секции «Файлы» в карточке без файлов нет — файл, брошенный на любое место окна (на
 * «Описание»), становится вложением: пока файл над окном — рамка и подпись «Отпустите, чтобы приложить файл»; после —
 * уведомление и секция «Файлы» с превью. Новая карточка без файлов → WIN-14 «Для файла перетаскиванием»
 * (E2eSeeder); Анна → e2e-editor. Перенос файла из папки компьютера — событиями перетаскивания с файлом (dropFile).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const NAME = 'перетащенная-ТК-UI1.24.png'

test('ТК-UI1.24. Файл перетаскивается на окно @tc-UI1.24', async ({ page }) => {
  // 1. Открыть карточку — секции «Файлы» нет
  const window = await openCard(page, 'Для файла перетаскиванием')
  await expect(window.getByRole('region', { name: 'Файлы' })).toHaveCount(0)

  // 2. Перетащить картинку на «Описание» и отпустить
  const hint = window.getByText('Отпустите, чтобы приложить файл')
  await dropFile(page, window.getByRole('region', { name: 'Описание' }), NAME, async () => {
    // Пока файл над окном — подпись (и рамка вокруг окна)
    await expect(hint).toBeVisible()
    const frame = (await hint.boundingBox())!
    const box = (await window.boundingBox())!
    expect(frame.x).toBeGreaterThanOrEqual(box.x)
    expect(frame.x + frame.width).toBeLessThanOrEqual(box.x + box.width)
  })

  // Уведомление о загрузке, секция «Файлы» с превью картинки; подписи больше нет
  await expect(page.getByText(`Файл «${NAME}» приложен`)).toBeVisible()
  const preview = window
    .getByRole('region', { name: 'Файлы' })
    .getByRole('img', { name: NAME, exact: true })
  await preview.scrollIntoViewIfNeeded()
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await expect(hint).toBeHidden()
})
