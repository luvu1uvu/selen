import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Toaster } from '@/shared/ui/sonner'
import { createQueryClient, installSession } from './queryClient'
import { routes } from './routes'
import { installTheme } from './theme'

const router = createBrowserRouter(routes)

export function App() {
  const [queryClient] = useState(createQueryClient)

  useEffect(() => installSession(queryClient), [queryClient])
  useEffect(() => installTheme(queryClient), [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
}
