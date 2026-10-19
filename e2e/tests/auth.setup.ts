import { test as setup } from '@playwright/test'
import { authFile, login, USERS } from './helpers'

/**
 * Один вход каждым пользователем E2eSeeder на весь прогон: состояние (cookie сессии и XSRF) сохраняется
 * в e2e/.auth и подключается в тестах через storageState. Запускается проектом «setup» перед всеми тестами.
 */
for (const user of USERS) {
  setup(`вход: ${user}`, async ({ page }) => {
    await login(page, user)
    await page.context().storageState({ path: authFile(user) })
  })
}
