/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Порт, на котором nginx отдаёт приложение (для подключения HMR через nginx).
const appPort = Number(process.env.APP_PORT ?? 8080)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Браузер открывает приложение через nginx (localhost:APP_PORT), поэтому
    // WebSocket hot reload тоже идёт через nginx.
    hmr: { clientPort: appPort },
    // В Docker на macOS (Colima, virtiofs) события изменения файлов до контейнера не доходят —
    // без опроса Vite отдаёт старый код. Поэтому опрос включён по умолчанию; отключить можно
    // VITE_USE_POLLING=false (например, на Linux, где события работают). node_modules не опрашиваются.
    watch: {
      usePolling: process.env.VITE_USE_POLLING !== 'false',
      interval: 300,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx', 'src/shared/ui/**', '**/*.d.ts'],
      reporter: ['text-summary', 'text'],
      // Нижняя граница покрытия строк (решение PM на этапе 1): ниже — тесты падают
      thresholds: { lines: 77 },
    },
  },
})
