import { Navigate, type RouteObject } from 'react-router'
import { AdminCompanyLayout } from '@/features/admin/AdminCompanyLayout'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { AcceptInvitationPage } from '@/features/invitations/AcceptInvitationPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { FileNotFoundPage } from '@/pages/FileNotFoundPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AdminNotFound, AdminRedirect, RequireAdmin, RequireAuth, RequireGuest } from './guards'
import { RouteError } from './RouteError'
import { RouteLoading } from './RouteLoading'
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

const spacePage = async () => ({
  Component: (await import('@/features/spaces/SpacePage')).SpacePage,
})

/** Страницы досок и пространства прокручиваются своим холстом (ADR-0019). */
const canvas: RouteHandle = { canvas: true }

/**
 * Карта маршрутов SPA. Ссылки из писем (приглашение, сброс пароля) и адрес «файл не найден» формирует backend —
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
            // Пока грузится код страницы-чанка при первой загрузке приложения — «Загрузка…» на месте страницы
            hydrateFallbackElement: <RouteLoading />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/profile', element: <ProfilePage /> },
              // Ссылка на файл не открылась — сюда отправляет сервер (config/selen.php → frontend_paths, UI-1b)
              { path: '/file-not-found', element: <FileNotFoundPage /> },
              // Пространство — все его доски рядами на холсте (ADR-0019); карточка — поверх, со своим адресом
              { path: '/spaces/:spaceKey', lazy: spacePage, handle: canvas },
              { path: '/spaces/:spaceKey/cards/:cardKey', lazy: spacePage, handle: canvas },
              // Карточка открывается поверх своей доски, у неё свой адрес — ссылку можно переслать
              { path: '/boards/:boardId', lazy: boardPage, handle: canvas },
              { path: '/cards/:cardKey', lazy: boardPage, handle: canvas },
              {
                element: <RequireAdmin />,
                children: [
                  // Без компании в адресе (и прежние адреса /admin/users…) — админка компании по умолчанию
                  { path: '/admin', element: <AdminRedirect /> },
                  { path: '/admin/*', element: <AdminRedirect /> },
                  {
                    path: '/admin/companies',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/CompaniesPage')).CompaniesPage,
                    }),
                  },
                  // Админка компании (ADR-0024): /admin/c/<компания>/…; чужая компания — «не найдена»
                  {
                    path: '/admin/c/:companyId',
                    element: <AdminCompanyLayout />,
                    children: [
                      { index: true, element: <Navigate to="users" replace /> },
                      {
                        // «Пользователи» — вкладки как в Kaiten: пользователи, группы, приглашения
                        lazy: async () => ({
                          Component: (await import('@/features/admin/UsersSection')).UsersSection,
                        }),
                        children: [
                          {
                            path: 'users',
                            lazy: async () => ({
                              Component: (await import('@/features/admin/UsersPage')).UsersPage,
                            }),
                          },
                          {
                            path: 'groups',
                            lazy: async () => ({
                              Component: (await import('@/features/admin/GroupsPage')).GroupsPage,
                            }),
                          },
                          {
                            path: 'invitations',
                            lazy: async () => ({
                              Component: (await import('@/features/admin/UsersPage'))
                                .InvitationsPage,
                            }),
                          },
                        ],
                      },
                      {
                        path: 'users/:userId',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/UserAccessPage'))
                            .UserAccessPage,
                        }),
                      },
                      {
                        path: 'groups/:groupId',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/GroupPage')).GroupPage,
                        }),
                      },
                      {
                        path: 'trash',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/TrashPage')).TrashPage,
                        }),
                      },
                      {
                        path: 'events',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/EventLogPage')).EventLogPage,
                        }),
                      },
                      {
                        path: 'spaces',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/SpacesAdminPage'))
                            .SpacesAdminPage,
                        }),
                      },
                      {
                        path: 'structure',
                        lazy: async () => ({
                          Component: (await import('@/features/navigation/StructurePage'))
                            .StructurePage,
                        }),
                      },
                      {
                        path: 'labels',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/LabelsPage')).LabelsPage,
                        }),
                      },
                      {
                        path: 'card-types',
                        lazy: async () => ({
                          Component: (await import('@/features/admin/CardTypesPage')).CardTypesPage,
                        }),
                      },
                      { path: '*', element: <AdminNotFound /> },
                    ],
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
