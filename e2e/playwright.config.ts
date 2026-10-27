import { defineConfig, devices } from '@playwright/test'

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } }

/**
 * E2E-тесты идут против изолированного стека docker-compose.e2e.yml (make e2e):
 * production-сборка фронтенда + API на отдельной базе с данными E2eSeeder.
 * Версия @playwright/test должна совпадать с тегом образа mcr.microsoft.com/playwright.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8090',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Вход каждым пользователем один раз за прогон (лимит входов в минуту), см. tests/auth.setup.ts
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    { name: 'chromium', dependencies: ['setup'], use: desktop },
    // Приёмочные автотесты тест-кейсов: acceptance/stage-<N>/tc-<этап>.<номер>.spec.ts, тег @tc-… (acceptance/README.md)
    { name: 'acceptance', testDir: './acceptance', dependencies: ['setup'], use: desktop },
    // Тёмная тема (ADR-0025): экраны без светлых пятен и с контрастом, тема до первой отрисовки, переключатель. Система —
    // тёмная, у пользователя e2e-dark сохранена «Тёмная» (E2eSeeder::darkTheme)
    { name: 'dark', testDir: './dark', dependencies: ['setup'], use: { ...desktop, colorScheme: 'dark' } },
  ],
})
