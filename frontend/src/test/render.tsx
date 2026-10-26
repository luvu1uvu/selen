import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { installSession } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { installTheme } from '@/app/theme'
import { Toaster } from '@/shared/ui/sonner'

/** Отключение сессии и темы предыдущего renderApp: перехватчик axios общий для всех тестов файла. */
let uninstallSession: (() => void) | undefined
let uninstallTheme: (() => void) | undefined

/**
 * Отрисовать приложение целиком на указанном адресе (с настоящими маршрутами и guard'ами и с той же обработкой
 * сессии и темы, что в App: 401, смена пользователя, тема пользователя).
 */
export function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  uninstallSession?.()
  uninstallSession = installSession(queryClient)
  uninstallTheme?.()
  uninstallTheme = installTheme(queryClient)
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}
