import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { AdminSpace } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Label } from '@/shared/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { AssignSpaceRoleDialog } from './components/AssignSpaceRoleDialog'
import { CreateSpaceDialog } from './components/CreateSpaceDialog'
import { useAdminSpaces, useArchiveSpace, useRestoreSpace } from './queries'

/**
 * Пространства в админке: метаданные всех пространств. Доски пространства системный
 * администратор видит, только назначив себе роль (действие пишется в журнал).
 */
export function SpacesAdminPage() {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const spacesQuery = useAdminSpaces()
  const archive = useArchiveSpace()
  const restore = useRestoreSpace()
  const [showArchived, setShowArchived] = useState(false)
  const [assignTo, setAssignTo] = useState<AdminSpace | null>(null)
  const [toArchive, setToArchive] = useState<AdminSpace | null>(null)

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const spaces = (spacesQuery.data ?? []).filter((space) => showArchived || !space.archived_at)

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('spaces.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('spaces.description')}</p>
        </div>
        <CreateSpaceDialog />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="show-archived"
          checked={showArchived}
          onCheckedChange={(checked) => setShowArchived(checked === true)}
        />
        <Label htmlFor="show-archived">{t('spaces.showArchived')}</Label>
      </div>

      {spacesQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('spaces.columns.name')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('spaces.columns.admins')}</TableHead>
            <TableHead className="w-28">{t('spaces.columns.members')}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t('spaces.columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spacesQuery.isSuccess && spaces.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                {tc('states.empty')}
              </TableCell>
            </TableRow>
          )}
          {spaces.map((space) => (
            <TableRow key={space.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {space.name}
                  <Badge variant="secondary" className="font-mono">
                    {space.key}
                  </Badge>
                  {space.archived_at && (
                    <Badge variant="warning">{t('spaces.archivedBadge')}</Badge>
                  )}
                  {!space.has_active_admin && (
                    <Badge variant="destructive" title={t('spaces.noActiveAdminHint')}>
                      {t('spaces.noActiveAdmin')}
                    </Badge>
                  )}
                </div>
                {space.my_role && (
                  <div className="text-muted-foreground text-xs">
                    {t('spaces.myRole', { role: ts(`roles.${space.my_role}`) })}
                  </div>
                )}
                <div className="text-muted-foreground text-xs md:hidden">
                  {space.admins.map((admin) => admin.name).join(', ')}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {space.admins.length === 0 ? (
                  <span className="text-muted-foreground">{t('spaces.noAdmins')}</span>
                ) : (
                  space.admins.map((admin) => admin.name).join(', ')
                )}
              </TableCell>
              <TableCell>
                {space.members_count}
                {space.groups_count > 0 && (
                  <div className="text-muted-foreground text-xs">
                    {t('spaces.groupsCount', { count: space.groups_count })}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('spaces.actions.menu')}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setAssignTo(space)}>
                      {t('spaces.actions.assign')}
                    </DropdownMenuItem>
                    {space.my_role && (
                      <DropdownMenuItem onSelect={() => navigate(`/spaces/${space.key}`)}>
                        {t('spaces.actions.open')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {space.archived_at ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          run(() => restore.mutateAsync(space.id), t('spaces.toasts.restored'))
                        }
                      >
                        {t('spaces.actions.restore')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem variant="destructive" onSelect={() => setToArchive(space)}>
                        {t('spaces.actions.archive')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AssignSpaceRoleDialog space={assignTo} onClose={() => setAssignTo(null)} />

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        pending={archive.isPending}
        title={t('spaces.confirmArchiveTitle')}
        description={t('spaces.confirmArchiveText', { name: toArchive?.name ?? '' })}
        confirmLabel={t('spaces.actions.archive')}
        onConfirm={async () => {
          if (toArchive) {
            await run(() => archive.mutateAsync(toArchive.id), t('spaces.toasts.archived'))
          }
          setToArchive(null)
        }}
      />
    </div>
  )
}
