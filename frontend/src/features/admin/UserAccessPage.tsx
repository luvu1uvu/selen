import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { getErrorStatus } from '@/shared/api/errors'
import { isOwner, isSystemAdmin } from '@/shared/lib/roles'
import type { UserAccess } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useAdminUrl } from './company'
import { UserStatusBadge } from './components/UserStatusBadge'
import { useUserAccess } from './queries'

/**
 * Админка → пользователь: к каким пространствам у него доступ и почему — по каждому источнику
 * (лично, через группы), включая недействующие. Главный инструмент разбора «почему видит / не видит».
 */
export function UserAccessPage() {
  const { t } = useTranslation('admin')
  const url = useAdminUrl()
  const { t: tc } = useTranslation()
  const { userId = '' } = useParams()
  const accessQuery = useUserAccess(userId)

  if (accessQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {getErrorStatus(accessQuery.error) === 404 ? t('access.notFound') : tc('errors.loadFailed')}
      </p>
    )
  }
  const access = accessQuery.data
  if (!access) return <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          to={url('users')}
          className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('access.back')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {access.user.name}
          {isOwner(access.user) && (
            <Badge variant="secondary" title={t('users.badges.ownerHint')}>
              {tc('roles.owner')}
            </Badge>
          )}
          <UserStatusBadge user={access.user} />
        </h1>
        <p className="text-muted-foreground text-sm">{access.user.email}</p>
        {isSystemAdmin(access.user) && (
          <p className="text-muted-foreground max-w-2xl text-sm">{t('access.systemAdminHint')}</p>
        )}
      </div>

      <section className="grid gap-2" aria-labelledby="access-groups-title">
        <h2 id="access-groups-title" className="text-lg font-semibold">
          {t('access.groups')}
        </h2>
        {access.groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('access.noGroups')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {access.groups.map((group) => (
              <li key={group.id}>
                <Link to={url(`groups/${group.id}`)}>
                  <Badge variant={group.archived_at ? 'warning' : 'secondary'}>
                    {group.archived_at
                      ? t('access.archivedGroup', { name: group.name })
                      : group.name}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="access-spaces-title">
        <h2 id="access-spaces-title" className="text-lg font-semibold">
          {t('access.spaces')}
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm">{t('access.rule')}</p>
        <SpacesTable access={access} />
      </section>
    </div>
  )
}

function SpacesTable({ access }: { access: UserAccess }) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('access.columns.space')}</TableHead>
          <TableHead>{t('access.columns.result')}</TableHead>
          <TableHead>{t('access.columns.sources')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {access.spaces.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
              {t('access.noSpaces')}
            </TableCell>
          </TableRow>
        )}
        {access.spaces.map((entry) => (
          <TableRow key={entry.space.id}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {entry.space.name}
                <Badge variant="secondary" className="tabular-nums">
                  {entry.space.key}
                </Badge>
                {entry.space.archived_at && (
                  <Badge variant="warning">{t('spaces.archivedBadge')}</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              {entry.has_access && entry.role ? (
                <div className="grid gap-1">
                  <span>{ts(`roles.${entry.role}`)}</span>
                  <span className="text-muted-foreground text-xs">
                    {entry.sees_all_cards ? t('access.seesAll') : t('access.seesOwn')}
                  </span>
                </div>
              ) : (
                <Badge variant="destructive">{t('access.noAccess')}</Badge>
              )}
            </TableCell>
            <TableCell>
              <ul className="grid gap-1 text-sm">
                {entry.sources.map((source, index) => (
                  <li
                    key={source.group?.id ?? `personal-${index}`}
                    className={source.inactive_reason ? 'text-muted-foreground line-through' : ''}
                  >
                    {source.group
                      ? t('access.viaGroup', {
                          group: source.group.name,
                          role: ts(`roles.${source.role}`),
                        })
                      : t('access.personal', { role: ts(`roles.${source.role}`) })}
                    {source.own_cards_only && ` · ${ts('members.ownCardsOnly')}`}
                    {source.inactive_reason && (
                      <span className="ml-2 no-underline">
                        {t(`access.inactive.${source.inactive_reason}`)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
