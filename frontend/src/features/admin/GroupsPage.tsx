import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Label } from '@/shared/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { GroupDialog } from './components/GroupDialog'
import { useGroups } from './queries'

/**
 * Группы пользователей (ADR-0012): ведёт системный администратор. Группа получает доступ к пространствам
 * с ролью и режимом «только свои карточки»; права человека — по всем его источникам.
 */
export function GroupsPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const groupsQuery = useGroups()
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)

  const groups = (groupsQuery.data ?? []).filter((group) => showArchived || !group.archived_at)

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('groups.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('groups.description')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('groups.create')}</Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="groups-show-archived"
          checked={showArchived}
          onCheckedChange={(checked) => setShowArchived(checked === true)}
        />
        <Label htmlFor="groups-show-archived">{t('groups.showArchived')}</Label>
      </div>

      {groupsQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('groups.columns.name')}</TableHead>
            <TableHead className="w-32">{t('groups.columns.members')}</TableHead>
            <TableHead className="w-32">{t('groups.columns.spaces')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupsQuery.isSuccess && groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                {tc('states.empty')}
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <Link to={`/admin/groups/${group.id}`} className="hover:underline">
                    {group.name}
                  </Link>
                  {group.system && <Badge variant="secondary">{t('groups.systemBadge')}</Badge>}
                  {group.archived_at && (
                    <Badge variant="warning">{t('groups.archivedBadge')}</Badge>
                  )}
                </div>
                {group.description && (
                  <div className="text-muted-foreground text-xs">{group.description}</div>
                )}
              </TableCell>
              <TableCell>{group.members_count}</TableCell>
              <TableCell>{group.spaces_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <GroupDialog
        group={creating ? 'new' : null}
        onClose={() => setCreating(false)}
        onCreated={(group) => navigate(`/admin/groups/${group.id}`)}
      />
    </div>
  )
}
