import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { SpaceBoards } from '@/features/boards/components/SpaceBoards'
import { SpaceLabelsPanel } from '@/features/labels/components/SpaceLabelsPanel'
import { getErrorStatus } from '@/shared/api/errors'
import { NotFoundState } from '@/shared/components/NotFoundState'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { EditSpaceDialog } from './components/EditSpaceDialog'
import { MembersPanel } from './components/MembersPanel'
import { useSpace } from './queries'

/** Страница пространства: доски и участники. Чужое или несуществующее — «не найдено». */
export function SpacePage() {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { spaceKey = '' } = useParams()
  const spaceQuery = useSpace(spaceKey)

  if (spaceQuery.isPending) {
    return <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
  }

  if (spaceQuery.isError) {
    return getErrorStatus(spaceQuery.error) === 404 ? (
      <NotFoundState title={t('page.notFound')} text={t('page.notFoundText')} />
    ) : (
      <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
    )
  }

  const space = spaceQuery.data

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{space.name}</h1>
            <Badge variant="secondary" className="font-mono">
              {space.key}
            </Badge>
          </div>
          {space.description && (
            <p className="text-muted-foreground text-sm whitespace-pre-line">{space.description}</p>
          )}
          {space.my_role && (
            <p className="text-muted-foreground text-xs">
              {t('home.yourRole', { role: t(`roles.${space.my_role}`) })}
            </p>
          )}
        </div>
        {space.permissions.manage && <EditSpaceDialog space={space} />}
      </div>

      {space.archived_at && <Alert>{t('page.archived')}</Alert>}

      <Tabs defaultValue="boards">
        <TabsList>
          <TabsTrigger value="boards">{t('page.tabs.boards')}</TabsTrigger>
          <TabsTrigger value="members">{t('page.tabs.members')}</TabsTrigger>
          <TabsTrigger value="labels">{t('page.tabs.labels')}</TabsTrigger>
        </TabsList>
        <TabsContent value="boards">
          <SpaceBoards space={space} />
        </TabsContent>
        <TabsContent value="members">
          <MembersPanel space={space} />
        </TabsContent>
        <TabsContent value="labels">
          <SpaceLabelsPanel space={space} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
