import { useCallback, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { ArchivedBoardsDialog } from '@/features/boards/components/ArchivedBoardsDialog'
import { CreateBoardDialog } from '@/features/boards/components/CreateBoardDialog'
import { SpaceBoardsCanvas } from '@/features/boards/components/SpaceBoardsCanvas'
import { useSpaceBoards } from '@/features/boards/queries'
import { CardPanel } from '@/features/cards/components/CardPanel'
import { useCard } from '@/features/cards/queries'
import { SpaceLabelsPanel } from '@/features/labels/components/SpaceLabelsPanel'
import { getErrorStatus } from '@/shared/api/errors'
import { NotFoundState } from '@/shared/components/NotFoundState'
import type { Space } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { EditSpaceDialog } from './components/EditSpaceDialog'
import { MembersPanel } from './components/MembersPanel'
import { useSpace } from './queries'

/**
 * Страница пространства (/spaces/KEY, ADR-0019; docs/ui-reference/kaiten/README.md, раздел 03): сверху панель —
 * название, вкладки «Доски / Участники / Метки», «Архив досок», «Создать доску», настройки; под ней на вкладке «Доски» —
 * холст со всеми активными досками рядами (своя вертикальная прокрутка, верхняя панель приложения на месте). Карточка
 * (/spaces/KEY/cards/DEV-12) открывается окном поверх страницы, закрытие — на то же место. Чужое или несуществующее
 * пространство — «не найдено».
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
      <Tabs defaultValue="boards" className="min-h-0 flex-1 gap-0">
        {/* Панель пространства — вне прокрутки холста, всегда на месте */}
        <div className="bg-background flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{space.name}</h1>
            <Badge variant="secondary" className="font-mono">
              {space.key}
            </Badge>
            <SpaceInfo space={space} />
          </div>
          <TabsList>
            <TabsTrigger value="boards">{t('page.tabs.boards')}</TabsTrigger>
            <TabsTrigger value="members">{t('page.tabs.members')}</TabsTrigger>
            <TabsTrigger value="labels">{t('page.tabs.labels')}</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ArchivedBoardsDialog space={space} />
            {space.permissions.manage && <CreateBoardDialog spaceKey={space.key} />}
            {space.permissions.manage && <EditSpaceDialog space={space} />}
          </div>
        </div>

        {space.archived_at && (
          <Alert className="rounded-none border-x-0 border-t-0">{t('page.archived')}</Alert>
        )}

        <TabsContent value="boards" className="flex min-h-0 flex-col">
          <SpaceBoardsCanvas space={space} onOpenCard={openCard} />
        </TabsContent>
        <TabsContent value="members" className="min-h-0 overflow-y-auto p-4 md:p-8">
          <MembersPanel space={space} />
        </TabsContent>
        <TabsContent value="labels" className="min-h-0 overflow-y-auto p-4 md:p-8">
          <SpaceLabelsPanel space={space} />
        </TabsContent>
      </Tabs>

      {cardKey && <SpaceCard cardKey={cardKey} onClose={closeCard} />}
    </>
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
