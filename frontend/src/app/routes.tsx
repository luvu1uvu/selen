import type { RouteObject } from 'react-router'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { AcceptInvitationPage } from '@/features/invitations/AcceptInvitationPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RequireAdmin, RequireAuth, RequireGuest } from './guards'
import { RouteError } from './RouteError'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import type { RouteHandle } from './routeHandle'

/**
 * Тяжёлые разделы грузятся отдельными чанками при первом переходе (React Router lazy):
 * доска с карточкой (dnd-kit), страница пространства и страницы админки.
 * Вход, профиль и главная — в основном бандле: они нужны сразу.
 */
const boardPage = async () => ({
  Component: (await import('@/features/boards/BoardPage')).BoardPage,
})

/** Страницы досок прокручиваются своим холстом (ADR-0019). */
const canvas: RouteHandle = { canvas: true }

/**
 * Карта маршрутов SPA. Ссылки из писем (приглашение, сброс пароля) формирует backend —
 * при изменении путей здесь обновите config/selen.php → frontend_paths.
 *
 * Непойманная ошибка — экран RouteError, а не белый экран: внутри каркаса — на месте страницы
 * (полоса разделов и дерево остаются), снаружи — на весь экран.
 */
export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    errorElement: <RouteError fullScreen />,
    children: [
      {
        element: <RequireGuest />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Доступны и гостям, и вошедшим (страница сама предупредит о текущей сессии)
      { path: '/reset-password/:token', element: <ResetPasswordPage /> },
      { path: '/invitations/:token', element: <AcceptInvitationPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError fullScreen />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/profile', element: <ProfilePage /> },
              {
                path: '/spaces/:spaceKey',
                lazy: async () => ({
                  Component: (await import('@/features/spaces/SpacePage')).SpacePage,
                }),
              },
              // Карточка открывается поверх своей доски, у неё свой адрес — ссылку можно переслать
              { path: '/boards/:boardId', lazy: boardPage, handle: canvas },
              { path: '/cards/:cardKey', lazy: boardPage, handle: canvas },
              {
                element: <RequireAdmin />,
                children: [
                  {
                    path: '/admin/users',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/UsersPage')).UsersPage,
                    }),
                  },
                  {
                    path: '/admin/users/:userId',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/UserAccessPage')).UserAccessPage,
                    }),
                  },
                  {
                    path: '/admin/groups',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/GroupsPage')).GroupsPage,
                    }),
                  },
                  {
                    path: '/admin/groups/:groupId',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/GroupPage')).GroupPage,
                    }),
                  },
                  {
                    path: '/admin/trash',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/TrashPage')).TrashPage,
                    }),
                  },
                  {
                    path: '/admin/events',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/EventLogPage')).EventLogPage,
                    }),
                  },
                  {
                    path: '/admin/spaces',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/SpacesAdminPage')).SpacesAdminPage,
                    }),
                  },
                  {
                    path: '/admin/structure',
                    lazy: async () => ({
                      Component: (await import('@/features/navigation/StructurePage'))
                        .StructurePage,
                    }),
                  },
                  {
                    path: '/admin/labels',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/LabelsPage')).LabelsPage,
                    }),
                  },
                  {
                    path: '/admin/card-types',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/CardTypesPage')).CardTypesPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
