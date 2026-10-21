import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Archive, Info, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ArchivedBoardsDialog } from '@/features/boards/components/ArchivedBoardsDialog'
import { CreateBoardDialog } from '@/features/boards/components/CreateBoardDialog'
import { SpaceBoardsCanvas } from '@/features/boards/components/SpaceBoardsCanvas'
import { useSpaceBoards } from '@/features/boards/queries'
import { CardPanel } from '@/features/cards/components/CardPanel'
import { useCard } from '@/features/cards/queries'
import { SpaceLabelsPanel } from '@/features/labels/components/SpaceLabelsPanel'
import { getErrorStatus } from '@/shared/api/errors'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { NotFoundState } from '@/shared/components/NotFoundState'
import { TruncatedText } from '@/shared/components/TruncatedText'
import type { Space } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { EditSpaceDialog } from './components/EditSpaceDialog'
import { MembersPanel } from './components/MembersPanel'
import { useSpace } from './queries'

/**
 * Страница пространства (/spaces/KEY, ADR-0019; docs/ui-reference/kaiten/README.md, раздел 03): сверху панель
 * (SpacePanel), под ней на вкладке «Доски» — холст со всеми активными досками рядами (своя вертикальная прокрутка,
 * верхняя панель приложения на месте). Карточка (/spaces/KEY/cards/DEV-12) открывается окном поверх страницы, закрытие —
 * на то же место. Чужое или несуществующее пространство — «не найдено».
 */
export function SpacePage() {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { spaceKey = '', cardKey } = useParams()
  const navigate = useNavigate()
  const spaceQuery = useSpace(spaceKey)
  // Список досок — вместе с пространством, а не после него: холст ждал бы два запроса подряд
  useSpaceBoards(spaceKey)
  const openCard = useCallback(
    (key: string) => navigate(`/spaces/${spaceKey}/cards/${key}`),
    [navigate, spaceKey],
  )
  const closeCard = useCallback(() => navigate(`/spaces/${spaceKey}`), [navigate, spaceKey])
  // Вкладка — своя у страницы, но переход в другое пространство и к доске (?board=ID — из дерева, новая доска)
  // открывает «Доски»: иначе адрес и дерево сменились бы, а на экране остались участники
  const location = useLocation()
  const [tab, setTab] = useState('boards')
  const [seen, setSeen] = useState({ key: location.key, spaceKey })
  if (seen.key !== location.key) {
    setSeen({ key: location.key, spaceKey })
    if (seen.spaceKey !== spaceKey || new URLSearchParams(location.search).has('board'))
      setTab('boards')
  }

  if (spaceQuery.isPending) {
    return (
      <PageMessage>
        <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
      </PageMessage>
    )
  }

  if (spaceQuery.isError) {
    return (
      <PageMessage>
        {getErrorStatus(spaceQuery.error) === 404 ? (
          <NotFoundState title={t('page.notFound')} text={t('page.notFoundText')} />
        ) : (
          <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
        )}
      </PageMessage>
    )
  }

  const space = spaceQuery.data

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <SpacePanel space={space} tab={tab} />

        {space.archived_at && (
          <Alert className="rounded-none border-x-0 border-t-0">{t('page.archived')}</Alert>
        )}

        {/* Холст не размонтируется на других вкладках: загруженные доски и прокрутка остаются */}
        {/* tabIndex — без остановки Tab на самой панели (Radix ставит 0): внутри есть свои элементы с фокусом, а невидимая
            остановка на весь холст уводила Tab к первой доске (U-2 UX-ревью PR 3) */}
        <TabsContent
          value="boards"
          forceMount
          tabIndex={undefined}
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          <SpaceBoardsCanvas space={space} active={tab === 'boards'} onOpenCard={openCard} />
        </TabsContent>
        <TabsContent
          value="members"
          tabIndex={undefined}
          className="min-h-0 overflow-y-auto p-3 md:p-4"
        >
          <MembersPanel space={space} />
        </TabsContent>
        <TabsContent
          value="labels"
          tabIndex={undefined}
          className="min-h-0 overflow-y-auto p-3 md:p-4"
        >
          <SpaceLabelsPanel space={space} />
        </TabsContent>
      </Tabs>

      {cardKey && <SpaceCard cardKey={cardKey} onClose={closeCard} />}
    </>
  )
}

/** Окно, которое открыла панель пространства. */
type PanelDialog = 'archive' | 'create' | 'edit' | null

/**
 * Панель пространства — вне прокрутки холста, всегда на месте. Как в Kaiten: название, ключ, ⓘ, вкладки «Доски /
 * Участники / Метки», сразу за ними — «Архив досок» и «Создать доску» (только на вкладке «Доски»); правая часть панели —
 * под «Фильтры» (этап 6), там пока только «Изменить» (LATER-74, решения PM 20.10).
 *
 * Узкий экран (768 px и уже — та же граница, что «доски в колонку», брейкпоинт rows) — одна строка: «Название · ключ ·
 * ⓘ · вкладки · ⋯»; кнопки — пунктами меню «⋯» (только доступные; нет ни одного — нет и «⋯»). Длинное название
 * обрезается, полное — в подсказке; вкладки и «⋯» не переносятся (дополнение PM 21.10).
 */
function SpacePanel({ space, tab }: { space: Space; tab: string }) {
  const { t } = useTranslation('spaces')
  const { t: tb } = useTranslation('boards')
  const [dialog, setDialog] = useState<PanelDialog>(null)
  const onBoards = tab === 'boards'
  const canManage = space.permissions.manage
  const close = (open: boolean) => !open && setDialog(null)

  return (
    <div className="bg-background rows:flex-wrap rows:gap-x-4 flex items-center gap-x-1.5 gap-y-2 border-b px-3 py-2 md:px-4">
      <div className="rows:gap-2 flex min-w-0 items-center gap-1">
        <TruncatedText as="h1" text={space.name} className="text-lg font-semibold" />
        <Badge variant="secondary" className="max-rows:px-1.5 shrink-0 font-mono">
          {space.key}
        </Badge>
        <SpaceInfo space={space} />
      </div>
      <TabsList className="shrink-0">
        {/* На узком экране — плотнее (и зазоры, и поля бейджа): вся панель в одну строку и на 375 px */}
        <TabsTrigger value="boards" className="max-rows:px-1.5">
          {t('page.tabs.boards')}
        </TabsTrigger>
        <TabsTrigger value="members" className="max-rows:px-1.5">
          {t('page.tabs.members')}
        </TabsTrigger>
        <TabsTrigger value="labels" className="max-rows:px-1.5">
          {t('page.tabs.labels')}
        </TabsTrigger>
      </TabsList>
      {onBoards && (
        <div className="max-rows:hidden flex items-center gap-2">
          <Button variant="outline" onClick={() => setDialog('archive')}>
            <Archive />
            {tb('layout.archived')}
          </Button>
          {canManage && <Button onClick={() => setDialog('create')}>{tb('list.create')}</Button>}
        </div>
      )}
      {canManage && (
        <Button
          variant="outline"
          className="max-rows:hidden ml-auto"
          onClick={() => setDialog('edit')}
        >
          {t('page.edit')}
        </Button>
      )}
      {(onBoards || canManage) && (
        <ActionsMenu
          label={t('page.menu', { name: space.name })}
          className="rows:hidden ml-auto size-7"
        >
          {(opensDialog) => (
            <>
              {onBoards && (
                <DropdownMenuItem onSelect={opensDialog(() => setDialog('archive'))}>
                  <Archive />
                  {tb('layout.archived')}
                </DropdownMenuItem>
              )}
              {onBoards && canManage && (
                <DropdownMenuItem onSelect={opensDialog(() => setDialog('create'))}>
                  <Plus />
                  {tb('list.createItem')}
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onSelect={opensDialog(() => setDialog('edit'))}>
                  <Pencil />
                  {t('page.editItem')}
                </DropdownMenuItem>
              )}
            </>
          )}
        </ActionsMenu>
      )}

      <ArchivedBoardsDialog space={space} open={dialog === 'archive'} onOpenChange={close} />
      {canManage && (
        <CreateBoardDialog spaceKey={space.key} open={dialog === 'create'} onOpenChange={close} />
      )}
      {canManage && <EditSpaceDialog space={space} open={dialog === 'edit'} onOpenChange={close} />}
    </div>
  )
}

/** ⓘ на панели: описание пространства (переносы строк сохранены) и роль пользователя в нём. */
function SpaceInfo({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              aria-label={t('page.about')}
            >
              <Info />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('page.about')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="grid w-96 max-w-[calc(100vw-2rem)] gap-2">
        {space.description?.trim() ? (
          <p className="text-sm whitespace-pre-line select-text">{space.description.trim()}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('page.noDescription')}</p>
        )}
        {space.my_role && (
          <p className="text-muted-foreground text-xs">
            {t('home.yourRole', { role: t(`roles.${space.my_role}`) })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Карточка поверх пространства. Нет её или нет доступа — окна нет: сообщение и обратно на пространство. */
function SpaceCard({ cardKey, onClose }: { cardKey: string; onClose: () => void }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const cardQuery = useCard(cardKey)
  const failed = cardQuery.isError

  useEffect(() => {
    if (!failed) return
    toast.error(
      getErrorStatus(cardQuery.error) === 404 ? t('card.notFound') : tc('errors.loadFailed'),
    )
    onClose()
  }, [failed, cardQuery.error, onClose, t, tc])

  return failed ? null : <CardPanel cardKey={cardKey} onClose={onClose} />
}

/** Сообщение вместо страницы: страница-холст без отступов каркаса — отступы свои. */
function PageMessage({ children }: { children: ReactNode }) {
  return <div className="overflow-y-auto p-4 md:p-8">{children}</div>
}
