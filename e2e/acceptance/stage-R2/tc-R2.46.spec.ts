import { expect, test } from '@playwright/test'
import { treeFolder } from '../stage-3/helpers'
import {
  FOLDERS_PERSON,
  openStructure,
  pagesClosedAfterEach,
  structureAction,
  tree,
  treeFolderItem,
} from './helpers'

/**
 * ТК-R2.46: доступ к папке действует и на то, что создадут в ней позже. admin@ → e2e-admin; Демо Участник с ролью
 * «Комментатор» на «Операции» (предусловие — ТК-R2.45) → «E2E Ярослав Папкин» (e2e-folders@) с ролью «Комментатор»
 * на папке «E2E Склады» (E2eSeeder::foldersAccess). Шаг 1 — как в исправленном тексте ТК: пространство создаётся
 * в корне («Добавить в дерево» → «Пространство») и переносится в папку «Структурой» («Переместить в…»), — в демо-данных
 * admin@ папки «Операции» в своём дереве не видит. Название и ключ нового пространства — одноразовые; в конце оно
 * удаляется навсегда (карточек в нём нет) — тест можно повторить.
 */

const FOLDER = 'E2E Склады'

/** Ключ пространства — только латинские буквы, 2–10 (CHECK в БД): «ST» и метка времени буквами. */
const uniqueKey = () =>
  `ST${Date.now()
    .toString(36)
    .toUpperCase()
    .replace(/[0-9]/g, (digit) => 'ABCDEFGHIJ'[Number(digit)])
    .slice(-8)}`

/** Страницы сотрудников закрываются после теста. */
const openAs = pagesClosedAfterEach()

test('ТК-R2.46. Новое пространство в папке сразу доступно @tc-R2.46', async ({ browser }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  const name = `Склад ${Date.now().toString(36)}`
  const key = uniqueKey()

  // До: у сотрудника папка в дереве, нового пространства в ней нет
  const person = await openAs(browser, 'e2e-folders@selen.test')
  await expect(treeFolder(person, FOLDER)).toBeVisible()
  await expect(tree(person).getByText(name, { exact: true })).toHaveCount(0)

  // 1. Администратор: «Структура» → «Добавить в дерево» → «Пространство» → название, ключ → «Создать»
  const admin = await openAs(browser, 'e2e-admin@selen.test')
  await openStructure(admin)
  await admin.getByRole('button', { name: 'Добавить в дерево' }).click()
  await admin.getByRole('menuitem', { name: 'Пространство', exact: true }).click()
  const dialog = admin.getByRole('dialog', { name: 'Новое пространство' })
  await dialog.getByLabel('Название', { exact: true }).fill(name)
  await dialog.getByLabel('Ключ', { exact: true }).fill(key)
  // Создание пространства под нагрузкой полного прогона бывает дольше 5 с: ждём ответ сервера, как tree.spec
  const created = admin.waitForResponse(
    (r) => /\/api\/v1\/admin\/companies\/[^/]+\/spaces$/.test(r.url()) && r.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click()
  const response = await created
  expect(response.status(), await response.text()).toBe(201)
  await expect(dialog).toBeHidden()
  await expect(admin.getByText('Пространство создано')).toBeVisible()

  try {
    // …«⋯» у нового пространства → «Переместить в…» → «Куда» — папка → «Переместить»
    await openStructure(admin)
    await structureAction(admin, name, 'Переместить в…')
    const move = admin.getByRole('dialog', { name: `Переместить «${name}»` })
    await move.getByLabel('Куда').selectOption({ label: FOLDER })
    await expect(move.getByText(`Получат доступ: ${FOLDERS_PERSON}`)).toBeVisible()
    await move.getByRole('button', { name: 'Переместить', exact: true }).click()
    await expect(move).toBeHidden()
    await expect(admin.getByText('Перемещено').first()).toBeVisible()

    // 2. Сотрудник обновляет страницу: в папке — новое пространство, оно открывается
    await person.reload()
    const folder = treeFolder(person, FOLDER)
    await expect(folder).toBeVisible()
    if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click()
    const link = treeFolderItem(person, FOLDER).getByRole('link', { name: new RegExp(`${name}$`) })
    await expect(link).toBeVisible()
    await link.click()
    await expect(person).toHaveURL(new RegExp(`/spaces/${key}$`))
    await expect(person.getByRole('heading', { name }).first()).toBeVisible()
    await expect(person.getByText('Нет доступа к пространству или оно не существует')).toHaveCount(0)
  } finally {
    // Вернуть как было: пространство без карточек удаляется навсегда
    await openStructure(admin)
    await structureAction(admin, name, 'Удалить навсегда…')
    await admin
      .getByRole('dialog', { name: 'Удалить пространство навсегда?' })
      .getByRole('button', { name: 'Удалить навсегда' })
      .click()
    await expect(admin.getByText('Пространство удалено')).toBeVisible()
  }
})
