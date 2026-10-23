import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import {
  Building2,
  FolderTree,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  ScrollText,
  ShieldCheck,
  Tag,
  Tags,
  Trash2,
  User as UserIcon,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useCurrentUser, useLogout } from '@/features/auth/queries'
import { TreePanel } from '@/features/navigation/components/TreePanel'
import { Hint } from '@/shared/components/Hint'
import { isSystemAdmin } from '@/shared/lib/roles'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { usePersistentState } from '@/shared/lib/usePersistentState'
import { useScrollMemory } from '@/shared/lib/useScrollMemory'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet'
import type { RouteHandle } from '../routeHandle'

/**
 * Разделы полосы слева (как в Kaiten, docs/ui-reference/kaiten/README.md, раздел 01). Сейчас — «Дерево»
 * и «Администрирование»; будущие разделы (уведомления, избранное, «моё») встанут в этот список.
 */
type Section = 'tree' | 'admin'

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Users
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground flex size-10 items-center justify-center rounded-lg transition-colors',
        active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

function AdminLink({
  to,
  icon: Icon,
  children,
  onNavigate,
}: {
  to: string
  icon: typeof Users
  children: ReactNode
  onNavigate: () => void
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors',
          isActive && 'bg-accent text-foreground font-medium',
        )
      }
    >
      <Icon className="size-4" />
      {children}
    </NavLink>
  )
}

/** Панель «Администрирование» — разделы админки системного администратора. */
function AdminPanel({
  onCollapse,
  onNavigate,
}: {
  onCollapse: () => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const links = [
    { to: '/admin/users', icon: Users, label: t('nav.users') },
    { to: '/admin/groups', icon: UsersRound, label: t('nav.groups') },
    { to: '/admin/spaces', icon: Building2, label: t('nav.spaces') },
    { to: '/admin/structure', icon: FolderTree, label: t('nav.structure') },
    { to: '/admin/card-types', icon: Tags, label: t('nav.cardTypes') },
    { to: '/admin/labels', icon: Tag, label: t('nav.labels') },
    { to: '/admin/trash', icon: Trash2, label: t('nav.trash') },
    { to: '/admin/events', icon: ScrollText, label: t('nav.events') },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-base font-semibold">{t('nav.admin')}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 md:inline-flex"
          onClick={onCollapse}
          aria-label={t('nav.collapsePanel')}
          title={t('nav.collapsePanel')}
        >
          <PanelLeftClose />
        </Button>
      </div>
      <nav aria-label={t('nav.admin')} className="grid gap-0.5 overflow-y-auto px-2 pb-4">
        {links.map((link) => (
          <AdminLink key={link.to} to={link.to} icon={link.icon} onNavigate={onNavigate}>
            {link.label}
          </AdminLink>
        ))}
      </nav>
    </div>
  )
}

/**
 * Каркас приложения в стиле Kaiten: узкая полоса разделов, панель выбранного раздела (сворачивается,
 * состояние запоминается в браузере), шапка и содержимое страницы. На экране уже 768 px полоса и панель —
 * выезжающее слева окно (`Sheet`): Esc и щелчок мимо закрывают его, фокус внутри, после закрытия — снова на «Открыть
 * меню» (LATER-108).
 *
 * Окно не прокручивается (ADR-0019): шапка и дерево всегда на месте, прокручивается содержимое — `main`
 * обычной страницы или холст страницы досок (маршрут с `handle.canvas` получает всю высоту без отступов).
 */
export function AppLayout() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  const isAdmin = isSystemAdmin(user)
  const [menuOpen, setMenuOpen] = useState(false)
  const desktop = useMediaQuery('(min-width: 48rem)')
  // Окно стало широким — выезжающее меню закрыто (иначе, сузив окно снова, пользователь увидел бы его открытым)
  const [wasDesktop, setWasDesktop] = useState(desktop)
  if (wasDesktop !== desktop) {
    setWasDesktop(desktop)
    setMenuOpen(false)
  }
  // Выбранный раздел — самостоятельное состояние (как в Kaiten): не зависит от открытой страницы,
  // запоминается для пользователя в браузере. «Администрирование» — только системному администратору.
  const [section, setSection] = usePersistentState<Section>(
    `selen.nav.section.${user?.id ?? 'guest'}`,
    'tree',
  )
  const [panelCollapsed, setPanelCollapsed] = usePersistentState('selen.sidebar.collapsed', false)
  const closeMenu = () => setMenuOpen(false)
  const activeSection: Section = isAdmin && section === 'admin' ? 'admin' : 'tree'
  const canvas = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.canvas)
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // Обычная страница: новая — с начала, «Назад» — на прежнее место (холст досок запоминает себя сам)
  useScrollMemory(mainRef, { name: 'main', page: pathname, ready: !canvas })

  // Повторный клик по открытому разделу сворачивает панель, по другому — открывает его
  const selectSection = (next: Section) => {
    if (next === activeSection && !panelCollapsed) {
      setPanelCollapsed(true)
      return
    }
    setSection(next)
    setPanelCollapsed(false)
  }

  const onLogout = async () => {
    await logoutMutation.mutateAsync().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  // Полоса разделов и панель: на широком экране — слева на месте, на узком — в выезжающем окне
  const sidebar = (
    <>
      <div className="bg-sidebar flex w-14 flex-col items-center gap-1 border-r py-2">
        <Link
          to="/"
          onClick={closeMenu}
          aria-label={t('nav.home')}
          title={t('nav.home')}
          className="bg-primary text-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg text-sm font-semibold"
        >
          {t('appName').charAt(0)}
        </Link>
        <nav aria-label={t('nav.sections')} className="flex flex-col items-center gap-1">
          <RailButton
            icon={Network}
            label={t('nav.tree')}
            active={activeSection === 'tree'}
            onClick={() => selectSection('tree')}
          />
          {isAdmin && (
            <RailButton
              icon={ShieldCheck}
              label={t('nav.admin')}
              active={activeSection === 'admin'}
              onClick={() => selectSection('admin')}
            />
          )}
        </nav>
        <Hint label={t('nav.closeMenu')}>
          <Button
            variant="ghost"
            size="icon"
            className="mt-auto md:hidden"
            onClick={closeMenu}
            aria-label={t('nav.closeMenu')}
          >
            <X />
          </Button>
        </Hint>
      </div>
      <div className={cn('bg-sidebar w-64 border-r', panelCollapsed && 'md:hidden')}>
        {activeSection === 'admin' ? (
          <AdminPanel onCollapse={() => setPanelCollapsed(true)} onNavigate={closeMenu} />
        ) : (
          <TreePanel onCollapse={() => setPanelCollapsed(true)} onNavigate={closeMenu} />
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-svh overflow-hidden">
      {desktop ? (
        <aside className="sticky top-0 flex h-svh">{sidebar}</aside>
      ) : (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            aria-describedby={undefined}
            className="w-auto flex-row gap-0 border-r-0 sm:max-w-none"
          >
            <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <Hint label={t('nav.openMenu')}>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label={t('nav.openMenu')}
            >
              <Menu />
            </Button>
          </Hint>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2" aria-label={t('nav.userMenu')}>
                <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-xs">
                  {user?.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="truncate">{user?.name}</div>
                <div className="text-muted-foreground truncate text-xs font-normal">
                  {user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/profile')}>
                <UserIcon />
                {t('nav.profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onLogout}>
                <LogOut />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main
          ref={mainRef}
          className={cn(
            'min-h-0 min-w-0 flex-1',
            canvas ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-4 md:p-8',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
