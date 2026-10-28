import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useMatch, useMatches, useNavigate } from 'react-router'
import {
  Building,
  Building2,
  ChevronsUpDown,
  FolderTree,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  PanelLeftClose,
  ScrollText,
  ShieldCheck,
  Sun,
  Tag,
  Tags,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react'
import {
  adminUrl,
  defaultAdminCompany,
  firstAdminPath,
  hasAdminAccess,
  hasCompanyPermission,
} from '@/features/admin/company'
import { useCurrentUser, useLogout } from '@/features/auth/queries'
import { useUpdateTheme } from '@/features/profile/queries'
import { TreePanel } from '@/features/navigation/components/TreePanel'
import { Hint } from '@/shared/components/Hint'
import { adminCompanies, isMultiCompany, isOwner } from '@/shared/lib/roles'
import { isTheme } from '@/shared/lib/theme'
import type { CompanyPermission, Theme } from '@/shared/types/api'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { usePersistentState } from '@/shared/lib/usePersistentState'
import { useScrollMemory } from '@/shared/lib/useScrollMemory'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
        'text-muted-foreground hover:bg-accent hover:text-foreground relative flex size-10 items-center justify-center rounded-lg transition-colors',
        // Активный раздел — подложка selected и полоска акцента 3 px у края полосы (признак формы, не только тон); кнопка
        // стоит в 8 px от края полосы 56 px — полоска на -left-2, ширина 3 px — вне шкалы, как в прототипе «Линии»
        active &&
          'bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground before:bg-primary before:absolute before:inset-y-2 before:-left-2 before:w-[3px] before:rounded-r-[3px]',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

function AdminLink({
  to,
  icon: Icon,
  active,
  children,
  onNavigate,
}: {
  to: string
  icon: typeof Users
  /** Пункт раздела с вкладками и страницами внутри («Пользователи») — активен на любой из них. */
  active?: boolean
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
          // Выбранный пункт — как выбранная строка дерева (NavTree)
          (active ?? isActive) &&
            'bg-selected hover:bg-selected group-hover/row:bg-selected text-foreground font-medium shadow-[inset_2px_0_0_var(--primary)]',
        )
      }
    >
      <Icon className="size-4" />
      {children}
    </NavLink>
  )
}

/** Темы в меню пользователя — в порядке решения PM (LATER-89): «Светлая / Тёмная / Как в системе». */
const THEMES: { value: Theme; icon: typeof Users }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

/**
 * Выбор темы — только в меню пользователя (решения PM 21.10, LATER-89, пп. 6–8). Меню после выбора не закрывается:
 * видно, что выбрано, и можно сразу сравнить.
 */
function ThemeMenuGroup() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const updateTheme = useUpdateTheme()
  return (
    <DropdownMenuRadioGroup
      value={user?.theme ?? 'light'}
      onValueChange={(value) => isTheme(value) && updateTheme.mutate(value)}
      aria-label={t('theme.title')}
    >
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        {t('theme.title')}
      </DropdownMenuLabel>
      {THEMES.map(({ value, icon: Icon }) => (
        <DropdownMenuRadioItem
          key={value}
          value={value}
          onSelect={(event) => event.preventDefault()}
        >
          <Icon />
          {t(`theme.${value}`)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

/** Пункты админки компании: адрес внутри /admin/c/<компания>/ и право компании, которое его открывает. */
const ADMIN_SECTIONS: {
  path: string
  icon: typeof Users
  label:
    | 'nav.users'
    | 'nav.spaces'
    | 'nav.structure'
    | 'nav.cardTypes'
    | 'nav.labels'
    | 'nav.trash'
    | 'nav.events'
  permissions: CompanyPermission[]
}[] = [
  {
    path: 'users',
    icon: Users,
    label: 'nav.users',
    // Вкладки «Пользователи», «Группы», «Приглашения» — пункт виден, если открыта хоть одна
    permissions: ['company.manage_users', 'company.manage_groups', 'company.invite_users'],
  },
  {
    path: 'spaces',
    icon: Building2,
    label: 'nav.spaces',
    permissions: ['company.manage_structure'],
  },
  {
    path: 'structure',
    icon: FolderTree,
    label: 'nav.structure',
    permissions: ['company.manage_structure'],
  },
  {
    path: 'card-types',
    icon: Tags,
    label: 'nav.cardTypes',
    permissions: ['company.manage_dictionaries'],
  },
  { path: 'labels', icon: Tag, label: 'nav.labels', permissions: ['company.manage_dictionaries'] },
  { path: 'trash', icon: Trash2, label: 'nav.trash', permissions: ['company.manage_trash'] },
  {
    path: 'events',
    icon: ScrollText,
    label: 'nav.events',
    permissions: ['company.view_event_log'],
  },
]

/** Адреса раздела «Пользователи»: его вкладки и страницы человека и группы. */
const USERS_PATHS = ['users', 'groups', 'invitations']

/**
 * Панель «Администрирование» (ADR-0024): у Владельца — «Компании» (только в копии с несколькими компаниями, ADR-0026);
 * сверху — выбор компании (только если их несколько: у кого компания одна, её названия нигде нет); пункты меню — по
 * правам компании. Компания панели — из адреса
 * админки компании, на других страницах — последняя выбранная.
 */
function AdminPanel({
  onCollapse,
  onNavigate,
}: {
  onCollapse: () => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const navigate = useNavigate()
  const companies = adminCompanies(user)
  const match = useMatch('/admin/c/:companyId/*')
  const fromAddress = companies.find((item) => item.id === match?.params.companyId)
  const company = fromAddress ?? defaultAdminCompany(user)
  // Раздел адреса: users, groups, spaces… (на странице человека или группы — её список); чужая или несуществующая
  // компания в адресе — «Страница не найдена», пункт меню не подсвечивается (U-9 UX-ревью П2b-2)
  const section = fromAddress ? (match?.params['*']?.split('/')[0] ?? '') : ''
  const sections = ADMIN_SECTIONS.filter((item) =>
    item.permissions.some((permission) => hasCompanyPermission(company, permission)),
  )

  // Другая компания — тот же раздел в ней (со страницы человека или группы — их список)
  const selectCompany = (id: string) => {
    const same =
      ADMIN_SECTIONS.some((item) => item.path === section) || USERS_PATHS.includes(section)
    const target = companies.find((item) => item.id === id)
    navigate(adminUrl(id, same ? section : (firstAdminPath(target) ?? 'users')))
    onNavigate()
  }

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
      <nav
        aria-label={t('nav.admin')}
        className="grid scroll-py-1 gap-0.5 overflow-y-auto px-2 pt-1 pb-4"
      >
        {isOwner(user) && isMultiCompany(user) && (
          <>
            <AdminLink to="/admin/companies" icon={Building} onNavigate={onNavigate}>
              {t('nav.companies')}
            </AdminLink>
            <div className="my-2 border-t" />
          </>
        )}
        {companies.length > 1 && company && (
          // Меню, а не список select: стрелки в закрытом select сразу сменили бы компанию (WCAG 3.2.2); длинное
          // название — «…» на кнопке, полностью — в меню (U-10 UX-ревью П2b-2)
          <div className="mb-2 grid gap-1">
            <span aria-hidden className="text-muted-foreground px-2 text-xs">
              {t('nav.company')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-between gap-2"
                  aria-label={t('nav.companySelect', { name: company.name })}
                >
                  <span className="truncate">{company.name}</span>
                  <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width)"
              >
                {companies.map((item) => (
                  <DropdownMenuCheckboxItem
                    key={item.id}
                    checked={item.id === company.id}
                    onCheckedChange={() => item.id !== company.id && selectCompany(item.id)}
                    className="break-words"
                  >
                    {item.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {company &&
          sections.map((item) => (
            <AdminLink
              key={item.path}
              to={adminUrl(
                company.id,
                // «Пользователи» — на первую доступную вкладку (П2c: прав может быть только на «Приглашения»)
                item.path === 'users'
                  ? (firstAdminPath(company, USERS_PATHS) ?? item.path)
                  : item.path,
              )}
              icon={item.icon}
              active={item.path === 'users' ? !!match && USERS_PATHS.includes(section) : undefined}
              onNavigate={onNavigate}
            >
              {t(item.label)}
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
  const isAdmin = hasAdminAccess(user)
  const [menuOpen, setMenuOpen] = useState(false)
  const desktop = useMediaQuery('(min-width: 48rem)')
  // Окно стало широким — выезжающее меню закрыто (иначе, сузив окно снова, пользователь увидел бы его открытым)
  const [wasDesktop, setWasDesktop] = useState(desktop)
  if (wasDesktop !== desktop) {
    setWasDesktop(desktop)
    setMenuOpen(false)
  }
  // Выбранный раздел — самостоятельное состояние (как в Kaiten): не зависит от открытой страницы,
  // запоминается для пользователя в браузере. «Администрирование» — только администратору компании и Владельцу.
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
        {/* Без подсказки: внутри выезжающего меню фокус с клавиатуры открыл бы её, и первый Esc закрыл бы подсказку, а не
            меню (LATER-108); «Открыть меню» снаружи — с подсказкой, фокус на неё возвращается без подсказки */}
        <Button
          variant="ghost"
          size="icon"
          className="mt-auto md:hidden"
          onClick={closeMenu}
          aria-label={t('nav.closeMenu')}
        >
          <X />
        </Button>
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
              {/* Видимое имя — в начале доступного: «нажми Анна Смирнова» находит кнопку (WCAG 2.5.3, LATER-118) */}
              <Button
                variant="ghost"
                className="gap-2"
                aria-label={user ? t('nav.userMenu', { name: user.name }) : undefined}
              >
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
              <ThemeMenuGroup />
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
