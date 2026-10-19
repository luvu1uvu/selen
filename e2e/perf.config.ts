import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/** Замер производительности доски (make perf): тот же стек и браузер, что у E2E, но свой каталог. */
export default defineConfig({
  ...base,
  testDir: './perf',
  testMatch: '*.perf.ts',
  retries: 0,
  reporter: [['list']],
})
