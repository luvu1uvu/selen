import { expect, test, type Page } from '@playwright/test'
import { pageAs } from './helpers'

/**
 * Дерево навигации (ADR-0013): папка видна только тому, у кого внутри есть доступное пространство
 * (правило одно для всех, полная структура — только в «Структуре»); поиск по дереву показывает найденное вместе
 * с родительской папкой; перенос в «Структуре» сразу виден в дереве и меняет только место.
 */
function tree(page: Page) {
  return page.getByRole('navigation', { name: 'Дерево' })
}

test('папка видна только с доступным пространством внутри; поиск по дереву', async ({ browser }) => {
  const editorPage = await pageAs(browser, 'e2e-editor@selen.test')

  const nav = tree(editorPage)
  const folder = nav.getByRole('button', { name: /E2E Мобильные/ })
  await expect(folder).toHaveAttribute('aria-expanded', 'false')
  await expect(nav.getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /Мобильные приложения/ })).toHaveCount(0)

  // Поиск по части названия доски: доска — под пространством, вместе с раскрытой папкой
  await editorPage.getByRole('searchbox', { name: 'Поиск по дереву' }).fill('рел')
  await expect(folder).toHaveAttribute('aria-expanded', 'true')
  await expect(nav.getByRole('link', { name: /Мобильные приложения/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /Сквозные тесты/ })).toHaveCount(0)
  await nav.getByRole('link', { name: 'Релизы' }).click()
  await expect(editorPage.getByRole('heading', { name: 'Релизы' })).toBeVisible()

  // Без доступа к пространствам папки — папки нет нигде на странице
  const restrictedPage = await pageAs(browser, 'e2e-restricted@selen.test')
  await expect(tree(restrictedPage).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(restrictedPage.getByText('E2E Мобильные')).toHaveCount(0)
})

test('перенос в «Структуре» сразу виден в открытом дереве', async ({ browser }) => {
  const page = await pageAs(browser, 'e2e-admin@selen.test')
  await page.goto('/admin/structure')
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()

  // Раздел «Дерево» открыт по умолчанию — дерево рядом со «Структурой»
  const nav = tree(page)
  const folder = nav.getByRole('button', { name: /E2E Мобильные$/ })
  // Внутренний локатор filter({ has }) ищется внутри элемента списка — от page, а не от nav
  const folderItem = nav.getByRole('listitem').filter({ has: page.getByRole('button', { name: /E2E Мобильные$/ }) })
  await expect(nav.getByRole('link', { name: /E2E Перенос/ })).toBeVisible()
  await folder.click()

  // Без перезагрузки страницы: в папку…
  await moveTo(page, 'E2E Перенос', 'E2E Мобильные')
  await expect(folderItem.getByRole('link', { name: /E2E Перенос/ })).toBeVisible()

  // …и обратно в корень (тест можно повторить)
  await moveTo(page, 'E2E Перенос', 'Корень дерева')
  await expect(folderItem.getByRole('link', { name: /E2E Перенос/ })).toHaveCount(0)
  await nav.getByRole('link', { name: /E2E Перенос/ }).click()
  // Ключ пространства не изменился
  await expect(page).toHaveURL(/\/spaces\/MOVE$/)
  await expect(page.getByRole('heading', { name: 'E2E Перенос' })).toBeVisible()
})

test('новая пустая папка видна только в «Структуре» — ни в дереве администратора, ни у сотрудника', async ({ browser }) => {
  const name = `E2E Пустая ${Date.now()}`
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await adminPage.goto('/admin/structure')

  await adminPage.getByRole('button', { name: 'Создать папку' }).click()
  const dialog = adminPage.getByRole('dialog', { name: 'Новая папка' })
  await dialog.getByLabel('Название').fill(name)
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(dialog).toBeHidden()

  await expect(adminPage.getByRole('region', { name: 'Структура' }).getByText(name)).toBeVisible()
  // Дерево открыто рядом: пустой папки в нём нет
  await expect(tree(adminPage).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(tree(adminPage).getByText(name)).toHaveCount(0)

  // Сотрудник с доступом к QA
  const userPage = await pageAs(browser, 'e2e-restricted@selen.test')
  await expect(tree(userPage).getByRole('link', { name: /Сквозные тесты/ })).toBeVisible()
  await expect(userPage.getByText(name)).toHaveCount(0)
})

test('пространство из «+» на папке сразу появляется внутри неё', async ({ browser }) => {
  // Ключ — только латинские буквы: случайный, чтобы тест можно было повторить
  const key = Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
  const page = await pageAs(browser, 'e2e-admin@selen.test')
  const nav = tree(page)
  const folder = nav.getByRole('button', { name: /E2E Мобильные$/ })
  const folderItem = nav.getByRole('listitem').filter({ has: page.getByRole('button', { name: /E2E Мобильные$/ }) })

  // Как в обычной работе мышью: последний фокус — от клика. Без этого Chrome считает фокус, который меню
  // возвращает на «+», клавиатурным (:focus-visible) — страница только что открыта и мышью ещё ничего не нажимали
  await folder.click()

  // Кнопки строки: видны при наведении; меню закрыто кликом по пустому месту дерева и указатель увели —
  // кнопки скрываются сразу (фокус, вернувшийся на «+», их не держит)
  const qa = nav.getByRole('link', { name: /Сквозные тесты/ })
  const qaPlus = nav.getByRole('button', { name: 'Добавить в «Сквозные тесты»' })
  // Прозрачность — у обёртки кнопок (opacity не наследуется, у самой кнопки всегда 1)
  const qaActions = qaPlus.locator('xpath=..')
  await expect(qaActions).toHaveCSS('opacity', '0')
  await qa.hover()
  await expect(qaActions).toHaveCSS('opacity', '1')
  // Размеры дерева — до открытия меню: открытое меню скрывает остальную страницу от дерева доступности
  const box = (await nav.boundingBox())!
  await qaPlus.click()
  await expect(page.getByRole('menuitem', { name: 'Доску' })).toBeVisible()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
  await expect(page.getByRole('menu')).toBeHidden()
  await page.mouse.move(box.x + box.width + 300, box.y + 300)
  await expect(qaActions).toHaveCSS('opacity', '0')
  // С клавиатуры: поиск → «Добавить в дерево» → первая строка дерева — кнопки видны
  await page.getByRole('searchbox', { name: 'Поиск по дереву' }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(qa).toBeFocused()
  await expect(qaActions).toHaveCSS('opacity', '1')

  // Кнопки появляются при наведении на строку
  await folder.hover()
  await nav.getByRole('button', { name: 'Добавить в «E2E Мобильные»' }).click()
  await page.getByRole('menuitem', { name: 'Пространство' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новое пространство' })
  await expect(dialog.getByText('Оно появится в папке «E2E Мобильные».')).toBeVisible()
  await dialog.getByLabel('Название').fill(`E2E Новое ${key}`)
  await dialog.getByLabel('Ключ').fill(key)
  const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/admin/spaces') && r.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Создать' }).click()
  const response = await created
  expect(response.status(), await response.text()).toBe(201)
  await expect(dialog).toBeHidden()

  // Без перезагрузки: внутри папки (раскрыть, если свёрнута)
  if ((await folder.getAttribute('aria-expanded')) === 'false') await folder.click()
  await expect(folderItem.getByRole('link', { name: `E2E Новое ${key}` })).toBeVisible()
})

async function moveTo(page: Page, name: string, target: string) {
  await page.getByRole('button', { name: `Действия с «${name}»` }).click()
  await page.getByRole('menuitem', { name: 'Переместить в…' }).click()
  const dialog = page.getByRole('dialog', { name: `Переместить «${name}»` })
  await dialog.getByLabel('Куда').selectOption({ label: target.startsWith('Корень') ? target : `📱 ${target}` })
  await dialog.getByRole('button', { name: 'Переместить' }).click()
  await expect(page.getByText('Перемещено').first()).toBeVisible()
}
