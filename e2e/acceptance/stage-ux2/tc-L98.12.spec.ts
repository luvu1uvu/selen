import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { colorsOf, hex } from '../stage-L91/helpers'
import { DESKTOP, openCardByKey, tokenHex } from './helpers'

/**
 * ТК-L98.12 (V-6): у ссылки с названием рядом серым — домен. Анна → e2e-editor, DEV-231 → UXB-8 «Для ссылки»
 * (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.12. У ссылки — домен @tc-L98.12', async ({ page }) => {
  const window = await openCardByKey(page, 'UXB-8', 'Для ссылки')

  // 1. «+» → «Основное» → «Ссылка» → адрес https://figma.com/file/x, название «Макет» → добавить
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Ссылка' }).click()
  const links = window.getByRole('region', { name: 'Ссылки' })
  await links.getByRole('textbox', { name: 'Адрес ссылки' }).fill('https://figma.com/file/x')
  await links.getByRole('textbox', { name: 'Название (необязательно)' }).fill('Макет')
  await links.getByRole('button', { name: 'Добавить', exact: true }).click()

  // В «Ссылках» — «Макет» и рядом серым «figma.com»
  const link = links.getByRole('link', { name: 'Макет', exact: true })
  await expect(link).toBeVisible()
  const domain = links.getByText('figma.com', { exact: true })
  await expect(domain).toBeVisible()
  const linkBox = (await link.boundingBox())!
  const domainBox = (await domain.boundingBox())!
  expect(domainBox.x, 'домен — справа от названия').toBeGreaterThan(linkBox.x)
  expect(Math.abs(domainBox.y + domainBox.height / 2 - (linkBox.y + linkBox.height / 2)), 'на одной строке').toBeLessThanOrEqual(4)
  expect(hex((await colorsOf(domain)).text), 'домен серый').toBe(await tokenHex(page, 'muted-foreground'))
})
