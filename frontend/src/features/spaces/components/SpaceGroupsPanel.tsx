import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { Space, SpaceGroupGrant } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useRemoveSpaceGroup, useSpaceGroups, useUpdateSpaceGroup } from '../queries'
import { AddSpaceGroupDialog } from './AddSpaceGroupDialog'
import { EditRolesDialog } from './EditRolesDialog'
import { RoleChips } from './RolesField'

/**
 * Вкладка «Группы»: группы с доступом к пространству (ADR-0012) — на само пространство и унаследованные с папок выше
 * (пометка «через папку X», П2d-1; меняются в «Доступе…» той папки). Роли — чипами. Выдавать, менять роли и отзывать
 * доступ на самом пространстве — те, кто управляет в нём доступом; состав групп ведёт администратор компании.
 */
export function SpaceGroupsPanel({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const groupsQuery = useSpaceGroups(space.key)
  const update = useUpdateSpaceGroup(space.key)
  const remove = useRemoveSpaceGroup(space.key)
  const [toRemove, setToRemove] = useState<SpaceGroupGrant | null>(null)
  const [editing, setEditing] = useState<SpaceGroupGrant | null>(null)
  const canManage = space.permissions.manage

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const grants = groupsQuery.data ?? []
  const nameOf = (grant: SpaceGroupGrant) => grant.group.name ?? t('members.hiddenGroup')

  return (
    <div className="grid gap-4">
      {canManage && (
        <div className="flex justify-end">
          <AddSpaceGroupDialog
            spaceKey={space.key}
            companyId={space.company_id}
            grantedIds={grants
              .filter((grant) => !grant.inherited_from)
              .map((grant) => grant.group.id)}
          />
        </div>
      )}

      {groupsQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('groups.columns.name')}</TableHead>
            <TableHead>{t('groups.columns.role')}</TableHead>
            {canManage && (
              <TableHead>
                <span className="sr-only">{t('groups.columns.actions')}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupsQuery.isSuccess && grants.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                {t('groups.empty')}
              </TableCell>
            </TableRow>
          )}
          {grants.map((grant) => {
            // Гостю группы компании-хозяина — без названий (решение PM 28.10); управлять ими он не может
            const group = { ...grant.group, name: nameOf(grant) }
            const folder = grant.inherited_from
            const editable = canManage && !group.archived_at && !folder
            return (
              <TableRow key={`${group.id}|${folder?.id ?? ''}`}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {group.name}
                    {group.system && (
                      <Badge variant="secondary" title={t('groups.systemHint')}>
                        {t('groups.system')}
                      </Badge>
                    )}
                    {group.archived_at && (
                      <Badge variant="warning" title={t('groups.archivedHint')}>
                        {t('groups.archived')}
                      </Badge>
                    )}
                    {folder && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <Badge variant="outline">
                              {t('groups.inherited', { folder: folder.name })}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('groups.inheritedHint', { folder: folder.name })}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {/* Гостю численности и описания нет (LATER-139) — строки нет */}
                  {group.members_count !== null && (
                    <div className="text-muted-foreground text-xs">
                      {t('groups.membersCount', { count: group.members_count })}
                      {group.description && ` · ${group.description}`}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <RoleChips roles={grant.roles} />
                </TableCell>
                {canManage && (
                  <TableCell>
                    {/* Унаследованный доступ меняется на своей папке — здесь действий нет */}
                    {!folder && (
                      <div className="flex justify-end gap-1">
                        {editable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('groups.editRolesLabel', { name: group.name })}
                            onClick={() => setEditing(grant)}
                          >
                            {t('groups.editRoles')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('groups.removeLabel', { name: group.name })}
                          onClick={() => setToRemove(grant)}
                        >
                          {t('groups.remove')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <EditRolesDialog
        target={
          editing && {
            title: t('groups.editRolesTitle', { name: nameOf(editing) }),
            description: t('groups.editRolesDescription'),
            roles: editing.roles,
            withoutManaging: editing.group.system !== null,
          }
        }
        onClose={() => setEditing(null)}
        onSave={async (roles) => {
          if (!editing) return
          await update.mutateAsync({ groupId: editing.group.id, roles })
          toast.success(t('groups.toasts.roleChanged'))
        }}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        pending={remove.isPending}
        title={t('groups.removeTitle')}
        description={t('groups.removeText', { name: toRemove ? nameOf(toRemove) : '' })}
        confirmLabel={t('groups.remove')}
        onConfirm={async () => {
          if (toRemove) {
            await run(() => remove.mutateAsync(toRemove.group.id), t('groups.toasts.removed'))
          }
          setToRemove(null)
        }}
      />
    </div>
  )
}
