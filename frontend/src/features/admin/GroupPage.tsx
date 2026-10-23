import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { RoleSelectOptions } from '@/features/spaces/components/RoleSelectOptions'
import { useAdminCompanyId } from '@/features/admin/company'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { formatDateTime } from '@/shared/lib/dates'
import { useCurrentUser } from '@/features/auth/queries'
import type { DirectoryUser, Group, SpaceRole } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Label } from '@/shared/ui/label'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { GroupDialog } from './components/GroupDialog'
import { UserStatusBadge } from './components/UserStatusBadge'
import {
  useAddGroupMember,
  useAdminSpaces,
  useAssignGroupSpace,
  useGroup,
  useRemoveGroupMember,
  useRevokeGroupSpace,
  useSetGroupArchived,
} from './queries'

type Confirm =
  { kind: 'member'; id: string; name: string } | { kind: 'space'; id: string; name: string } | null

/** Страница группы: состав и доступы к пространствам. Архивная группа — только для чтения. */
export function GroupPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { groupId = '' } = useParams()
  const groupQuery = useGroup(groupId)
  const archive = useSetGroupArchived()
  const removeMember = useRemoveGroupMember(groupId)
  const revokeSpace = useRevokeGroupSpace(groupId)
  const [editing, setEditing] = useState<Group | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  if (groupQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {getErrorStatus(groupQuery.error) === 404 ? t('groups.notFound') : tc('errors.loadFailed')}
      </p>
    )
  }
  const group = groupQuery.data
  if (!group) return <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
  const editable = !group.archived_at
  // Встроенная «Все сотрудники»: состав вычисляется, группу нельзя изменить или архивировать —
  // только выдавать пространствам (без роли администратора)
  const isSystem = group.system !== null

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          to="/admin/groups"
          className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('groups.back')}
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {group.name}
              {isSystem && <Badge variant="secondary">{t('groups.systemBadge')}</Badge>}
              {group.archived_at && <Badge variant="warning">{t('groups.archivedBadge')}</Badge>}
            </h1>
            {group.description && (
              <p className="text-muted-foreground max-w-2xl text-sm">{group.description}</p>
            )}
            {group.archived_at && (
              <p className="text-muted-foreground mt-1 text-sm">{t('groups.archivedHint')}</p>
            )}
          </div>
          {!isSystem && (
            <div className="flex gap-2">
              {editable && (
                <Button variant="outline" onClick={() => setEditing(group)}>
                  {t('groups.edit')}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={archive.isPending}
                onClick={() =>
                  run(
                    () => archive.mutateAsync({ id: group.id, archived: editable }),
                    editable ? t('groups.toasts.archived') : t('groups.toasts.restored'),
                  )
                }
              >
                {editable ? t('groups.archive') : t('groups.restore')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <section className="grid gap-4" aria-labelledby="group-members-title">
        <h2 id="group-members-title" className="text-lg font-semibold">
          {t('groups.members.title', { count: group.members_count })}
        </h2>
        {isSystem && (
          <p className="text-muted-foreground max-w-2xl text-sm">{t('groups.members.system')}</p>
        )}
        {editable && !isSystem && <AddMemberForm group={group} />}
        {!isSystem && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('groups.members.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('groups.members.added')}</TableHead>
                {editable && (
                  <TableHead className="w-28">
                    <span className="sr-only">{t('groups.members.actions')}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(group.members ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                    {t('groups.members.empty')}
                  </TableCell>
                </TableRow>
              )}
              {(group.members ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <Link to={`/admin/users/${member.id}`} className="hover:underline">
                        {member.name}
                      </Link>
                      {member.status !== 'active' && <UserStatusBadge user={member} />}
                    </div>
                    <div className="text-muted-foreground text-xs">{member.email}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <AddedAt value={member.added_at} />
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('groups.members.removeLabel', { name: member.name })}
                        onClick={() =>
                          setConfirm({ kind: 'member', id: member.id, name: member.name })
                        }
                      >
                        {t('groups.members.remove')}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="group-spaces-title">
        <div>
          <h2 id="group-spaces-title" className="text-lg font-semibold">
            {t('groups.spaces.title')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('groups.spaces.description')}</p>
        </div>
        {editable && <SpaceAccessForm group={group} />}
        <SpaceAccessTable
          group={group}
          editable={editable}
          onRevoke={(id, name) => setConfirm({ kind: 'space', id, name })}
        />
      </section>

      <GroupDialog group={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        pending={removeMember.isPending || revokeSpace.isPending}
        title={
          confirm?.kind === 'space'
            ? t('groups.spaces.revokeTitle')
            : t('groups.members.removeTitle')
        }
        description={
          confirm?.kind === 'space'
            ? t('groups.spaces.revokeText', { space: confirm.name, group: group.name })
            : t('groups.members.removeText', { name: confirm?.name ?? '', group: group.name })
        }
        confirmLabel={
          confirm?.kind === 'space' ? t('groups.spaces.revoke') : t('groups.members.remove')
        }
        onConfirm={async () => {
          if (confirm?.kind === 'member') {
            const id = confirm.id
            await run(() => removeMember.mutateAsync(id), t('groups.toasts.memberRemoved'))
          } else if (confirm?.kind === 'space') {
            const id = confirm.id
            await run(() => revokeSpace.mutateAsync(id), t('groups.toasts.spaceRevoked'))
          }
          setConfirm(null)
        }}
      />
    </div>
  )
}

function AddedAt({ value }: { value: string }) {
  const { data: me } = useCurrentUser()
  return <span className="text-sm">{formatDateTime(value, me?.timezone)}</span>
}

function AddMemberForm({ group }: { group: Group }) {
  const company = useAdminCompanyId()
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const add = useAddGroupMember(group.id)
  const [user, setUser] = useState<DirectoryUser | null>(null)

  const submit = async () => {
    if (!user) return
    try {
      await add.mutateAsync(user.id)
      toast.success(t('groups.toasts.memberAdded', { name: user.name }))
      setUser(null)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <div className="grid max-w-xl gap-2">
      <Label htmlFor="group-add-member">{t('groups.members.add')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <UserPicker
            companyId={company}
            id="group-add-member"
            value={user}
            onChange={setUser}
            excludeIds={(group.members ?? []).map((member) => member.id)}
          />
        </div>
        <Button disabled={!user || add.isPending} onClick={submit}>
          {t('groups.members.addSubmit')}
        </Button>
      </div>
    </div>
  )
}

function SpaceAccessForm({ group }: { group: Group }) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const spacesQuery = useAdminSpaces()
  const assign = useAssignGroupSpace(group.id)
  const [spaceId, setSpaceId] = useState('')
  const [role, setRole] = useState<SpaceRole>('commenter')
  const [ownCardsOnly, setOwnCardsOnly] = useState(false)
  const granted = new Set((group.spaces ?? []).map((grant) => grant.space.id))
  const options = (spacesQuery.data ?? []).filter(
    (space) => !space.archived_at && !granted.has(space.id),
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!spaceId) return
    try {
      await assign.mutateAsync({ spaceId, role, own_cards_only: role !== 'admin' && ownCardsOnly })
      toast.success(t('groups.toasts.spaceGranted'))
      setSpaceId('')
      setOwnCardsOnly(false)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="grid gap-1">
        <Label htmlFor="group-space">{t('groups.spaces.space')}</Label>
        <NativeSelect
          id="group-space"
          value={spaceId}
          onChange={(event) => setSpaceId(event.target.value)}
          className="sm:w-64"
        >
          <option value="">{t('groups.spaces.choose')}</option>
          {options.map((space) => (
            <option key={space.id} value={space.id}>
              {t('groups.spaces.option', { name: space.name, key: space.key })}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="group-space-role">{t('groups.spaces.role')}</Label>
        <NativeSelect
          id="group-space-role"
          value={role}
          onChange={(event) => setRole(event.target.value as SpaceRole)}
          className="sm:w-48"
        >
          <RoleSelectOptions withoutAdmin={group.system !== null} />
        </NativeSelect>
      </div>
      {role !== 'admin' && (
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="group-space-own"
            checked={ownCardsOnly}
            onCheckedChange={(checked) => setOwnCardsOnly(checked === true)}
          />
          <Label htmlFor="group-space-own" title={ts('members.ownCardsOnlyHint')}>
            {ts('members.ownCardsOnly')}
          </Label>
        </div>
      )}
      <Button type="submit" disabled={!spaceId || assign.isPending}>
        {t('groups.spaces.grant')}
      </Button>
    </form>
  )
}

function SpaceAccessTable({
  group,
  editable,
  onRevoke,
}: {
  group: Group
  editable: boolean
  onRevoke: (spaceId: string, name: string) => void
}) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const assign = useAssignGroupSpace(group.id)
  const grants = group.spaces ?? []

  const change = async (spaceId: string, role: SpaceRole, ownCardsOnly: boolean) => {
    try {
      await assign.mutateAsync({ spaceId, role, own_cards_only: role !== 'admin' && ownCardsOnly })
      toast.success(t('groups.toasts.spaceChanged'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('groups.spaces.space')}</TableHead>
          <TableHead className="w-48">{t('groups.spaces.role')}</TableHead>
          <TableHead>{t('groups.spaces.restriction')}</TableHead>
          {editable && (
            <TableHead className="w-28">
              <span className="sr-only">{t('groups.spaces.actions')}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {grants.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
              {t('groups.spaces.empty')}
            </TableCell>
          </TableRow>
        )}
        {grants.map((grant) => (
          <TableRow key={grant.space.id}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {grant.space.name}
                <Badge variant="secondary" className="font-mono">
                  {grant.space.key}
                </Badge>
                {grant.space.archived_at && (
                  <Badge variant="warning">{t('spaces.archivedBadge')}</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              {editable ? (
                <NativeSelect
                  aria-label={t('groups.spaces.roleLabel', { name: grant.space.name })}
                  value={grant.role}
                  disabled={assign.isPending}
                  onChange={(event) =>
                    change(grant.space.id, event.target.value as SpaceRole, grant.own_cards_only)
                  }
                >
                  <RoleSelectOptions withoutAdmin={group.system !== null} />
                </NativeSelect>
              ) : (
                ts(`roles.${grant.role}`)
              )}
            </TableCell>
            <TableCell>
              {editable && grant.role !== 'admin' ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`group-space-own-${grant.space.id}`}
                    aria-label={t('groups.spaces.ownCardsOnlyLabel', { name: grant.space.name })}
                    checked={grant.own_cards_only}
                    disabled={assign.isPending}
                    onCheckedChange={(checked) =>
                      change(grant.space.id, grant.role, checked === true)
                    }
                  />
                  <label htmlFor={`group-space-own-${grant.space.id}`} className="text-sm">
                    {ts('members.ownCardsOnly')}
                  </label>
                </div>
              ) : (
                grant.own_cards_only && (
                  <Badge variant="secondary">{ts('members.ownCardsOnly')}</Badge>
                )
              )}
            </TableCell>
            {editable && (
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('groups.spaces.revokeLabel', { name: grant.space.name })}
                  onClick={() => onRevoke(grant.space.id, grant.space.name)}
                >
                  {t('groups.spaces.revoke')}
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
