import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { Space, SpaceGroupGrant, SpaceRole } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useRemoveSpaceGroup, useSpaceGroups, useUpdateSpaceGroup } from '../queries'
import { AddSpaceGroupDialog } from './AddSpaceGroupDialog'
import { RoleSelectOptions } from './RoleSelectOptions'

/**
 * Вкладка «Группы»: группы с доступом к пространству (ADR-0012). Выдавать, менять и отзывать доступ —
 * администраторы пространства; состав групп ведёт системный администратор в админке.
 */
export function SpaceGroupsPanel({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const groupsQuery = useSpaceGroups(space.key)
  const update = useUpdateSpaceGroup(space.key)
  const remove = useRemoveSpaceGroup(space.key)
  const [toRemove, setToRemove] = useState<SpaceGroupGrant | null>(null)
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

  return (
    <div className="grid gap-4">
      {canManage && (
        <div className="flex justify-end">
          <AddSpaceGroupDialog
            spaceKey={space.key}
            companyId={space.company_id}
            grantedIds={grants.map((grant) => grant.group.id)}
          />
        </div>
      )}

      {groupsQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('groups.columns.name')}</TableHead>
            <TableHead className="w-48">{t('groups.columns.role')}</TableHead>
            <TableHead>{t('groups.columns.restriction')}</TableHead>
            {canManage && (
              <TableHead className="w-28">
                <span className="sr-only">{t('groups.columns.actions')}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupsQuery.isSuccess && grants.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                {t('groups.empty')}
              </TableCell>
            </TableRow>
          )}
          {grants.map((grant) => {
            const { group } = grant
            const editable = canManage && !group.archived_at
            return (
              <TableRow key={group.id}>
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
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('groups.membersCount', { count: group.members_count })}
                    {group.description && ` · ${group.description}`}
                  </div>
                </TableCell>
                <TableCell>
                  {editable ? (
                    <NativeSelect
                      className="min-w-40"
                      aria-label={t('groups.roleLabel', { name: group.name })}
                      value={grant.role}
                      disabled={update.isPending}
                      onChange={(event) =>
                        run(
                          () =>
                            update.mutateAsync({
                              groupId: group.id,
                              role: event.target.value as SpaceRole,
                            }),
                          t('groups.toasts.roleChanged'),
                        )
                      }
                    >
                      <RoleSelectOptions withoutAdmin={group.system !== null} />
                    </NativeSelect>
                  ) : (
                    t(`roles.${grant.role}`)
                  )}
                </TableCell>
                <TableCell>
                  {editable && grant.role !== 'admin' ? (
                    <div className="flex items-center gap-2" title={t('members.ownCardsOnlyHint')}>
                      <Checkbox
                        id={`group-own-cards-${group.id}`}
                        aria-label={t('groups.ownCardsOnlyLabel', { name: group.name })}
                        checked={grant.own_cards_only}
                        disabled={update.isPending}
                        onCheckedChange={(checked) =>
                          run(
                            () =>
                              update.mutateAsync({
                                groupId: group.id,
                                own_cards_only: checked === true,
                              }),
                            checked === true
                              ? t('members.restrictionOn')
                              : t('members.restrictionOff'),
                          )
                        }
                      />
                      <label
                        htmlFor={`group-own-cards-${group.id}`}
                        className="text-sm whitespace-nowrap"
                      >
                        {t('members.ownCardsOnly')}
                      </label>
                    </div>
                  ) : (
                    grant.own_cards_only && (
                      <Badge variant="secondary">{t('members.ownCardsOnly')}</Badge>
                    )
                  )}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('groups.removeLabel', { name: group.name })}
                      onClick={() => setToRemove(grant)}
                    >
                      {t('groups.remove')}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        pending={remove.isPending}
        title={t('groups.removeTitle')}
        description={t('groups.removeText', { name: toRemove?.group.name ?? '' })}
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
