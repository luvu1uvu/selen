import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminCompanyId, useAdminUrl } from '@/features/admin/company'
import { useRevokeNodeAccess, useSetNodeAccess } from '@/features/navigation/queries'
import { EditRolesDialog } from '@/features/spaces/components/EditRolesDialog'
import { RoleChips, RolesField } from '@/features/spaces/components/RolesField'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { getErrorBody, getErrorMessage, getErrorStatus } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { formatDateTime } from '@/shared/lib/dates'
import { useCurrentUser } from '@/features/auth/queries'
import type { DirectoryUser, Group, RoleKey } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { FormField } from '@/shared/ui/form-field'
import { Label } from '@/shared/ui/label'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { CompanyPermissionsSection } from './components/CompanyPermissionsSection'
import { GroupDialog } from './components/GroupDialog'
import { UserStatusBadge } from './components/UserStatusBadge'
import {
  useAddGroupMember,
  useGrantableNodes,
  useGroup,
  useRemoveGroupMember,
  useSetGroupArchived,
} from './queries'

type Confirm =
  { kind: 'member'; id: string; name: string } | { kind: 'space'; id: string; name: string } | null

/**
 * Страница группы: состав, «Сущности» (папки и пространства с ролями группы, П2d-1) и права компании. Архивная группа —
 * только для чтения.
 */
export function GroupPage() {
  const { t } = useTranslation('admin')
  const url = useAdminUrl()
  const { t: tc } = useTranslation()
  const { groupId = '' } = useParams()
  const groupQuery = useGroup(groupId)
  const archive = useSetGroupArchived()
  const removeMember = useRemoveGroupMember(groupId)
  const revokeAccess = useRevokeNodeAccess()
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
  // Состав и доступ группы — выдача доступа: с одним правом «управлять группами» их не поменять (П2c)
  const editableMembers = editable && (group.permissions?.manage_members ?? true)
  const editableSpaces = editable && (group.permissions?.manage_spaces ?? true)
  // Встроенная «Все сотрудники»: состав вычисляется, группу нельзя изменить или архивировать —
  // только выдавать пространствам (без роли администратора)
  const isSystem = group.system !== null

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          to={url('groups')}
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
              {/* Архив снимает доступ и права группы, возврат — снова выдаёт: не каждому, кто ведёт группы (П2c) */}
              {(group.permissions?.archive ?? true) && (
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
              )}
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
        {editableMembers && !isSystem && <AddMemberForm group={group} />}
        {!isSystem && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('groups.members.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('groups.members.added')}</TableHead>
                {editableMembers && (
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
                      <Link to={url(`users/${member.id}`)} className="hover:underline">
                        {member.name}
                      </Link>
                      {member.status !== 'active' && <UserStatusBadge user={member} />}
                    </div>
                    <div className="text-muted-foreground text-xs">{member.email}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <AddedAt value={member.added_at} />
                  </TableCell>
                  {editableMembers && (
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
        {editableSpaces && <EntityAccessForm group={group} />}
        <EntityAccessTable
          group={group}
          editable={editableSpaces}
          onRevoke={(id, name) => setConfirm({ kind: 'space', id, name })}
        />
      </section>

      <CompanyPermissionsSection groupId={group.id} everyone={group.system === 'everyone'} />

      <GroupDialog group={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        pending={removeMember.isPending || revokeAccess.isPending}
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
            await run(
              () =>
                revokeAccess.mutateAsync({ nodeId: id, subject: { type: 'group', id: groupId } }),
              t('groups.toasts.spaceRevoked'),
            )
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
            homes
          />
        </div>
        <Button disabled={!user || add.isPending} onClick={submit}>
          {t('groups.members.addSubmit')}
        </Button>
      </div>
    </div>
  )
}

/** Выдать группе доступ к папке или пространству с ролями чипами (П2d-1). */
function EntityAccessForm({ group }: { group: Group }) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const company = useAdminCompanyId()
  const nodes = useGrantableNodes(company)
  const setAccess = useSetNodeAccess()
  const [nodeId, setNodeId] = useState('')
  const [roles, setRoles] = useState<RoleKey[]>(['commenter'])
  const [error, setError] = useState<string>()
  const [rolesError, setRolesError] = useState<string>()
  const granted = new Set((group.entities ?? []).map((entity) => entity.node.id))
  // Активные папки и пространства в порядке дерева, с отступом по уровню
  const options = (nodes.data ?? []).filter((node) => !granted.has(node.id))
  const isSystem = group.system !== null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!nodeId) setError(t('groups.spaces.required'))
    if (roles.length === 0) setRolesError(ts('rolesField.required'))
    if (!nodeId || roles.length === 0) return
    try {
      await setAccess.mutateAsync({ nodeId, subject: { type: 'group', id: group.id }, roles })
      toast.success(t('groups.toasts.spaceGranted'))
      setNodeId('')
      setRoles(['commenter'])
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      if (errors?.roles?.[0]) setRolesError(errors.roles[0])
      else if (errors?.group_id?.[0]) setError(errors.group_id[0])
      else toast.error(getErrorMessage(err, tc('errors.generic')))
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-4" noValidate>
      <FormField id="group-entity" label={t('groups.spaces.space')} error={error}>
        <NativeSelect
          id="group-entity"
          value={nodeId}
          aria-invalid={!!error}
          onChange={(event) => {
            setNodeId(event.target.value)
            setError(undefined)
          }}
        >
          <option value="">{t('groups.spaces.choose')}</option>
          {options.map((node) => (
            <option key={node.id} value={node.id}>
              {`${'  '.repeat(node.depth - 1)}${
                node.space
                  ? t('groups.spaces.option', { name: node.name, key: node.space.key })
                  : t('groups.spaces.folderOption', { name: node.name })
              }`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="group-entity-roles" label={ts('rolesField.label')} error={rolesError}>
        <RolesField
          id="group-entity-roles"
          value={roles}
          onChange={(next) => {
            setRoles(next)
            setRolesError(undefined)
          }}
          withoutManaging={isSystem}
          invalid={!!rolesError}
        />
      </FormField>
      <Button type="submit" className="justify-self-start" disabled={setAccess.isPending}>
        {t('groups.spaces.grant')}
      </Button>
    </form>
  )
}

/** Папки и пространства группы с ролями (П2d-1): изменить роли, отозвать доступ. */
function EntityAccessTable({
  group,
  editable,
  onRevoke,
}: {
  group: Group
  editable: boolean
  onRevoke: (id: string, name: string) => void
}) {
  const { t } = useTranslation('admin')
  const setAccess = useSetNodeAccess()
  const entities = group.entities ?? []
  const [editing, setEditing] = useState<(typeof entities)[number] | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('groups.spaces.space')}</TableHead>
            <TableHead>{t('groups.spaces.role')}</TableHead>
            {editable && (
              <TableHead>
                <span className="sr-only">{t('groups.spaces.actions')}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entities.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                {t('groups.spaces.empty')}
              </TableCell>
            </TableRow>
          )}
          {entities.map((entity) => (
            <TableRow key={entity.node.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {entity.node.space
                    ? t('groups.spaces.option', {
                        name: entity.node.name,
                        key: entity.node.space.key,
                      })
                    : t('groups.spaces.folderOption', { name: entity.node.name })}
                  {entity.node.archived && (
                    <Badge variant="warning">{t('spaces.archivedBadge')}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <RoleChips roles={entity.roles} />
              </TableCell>
              {editable && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('groups.spaces.editRolesLabel', { name: entity.node.name })}
                      onClick={() => setEditing(entity)}
                    >
                      {t('groups.spaces.editRoles')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('groups.spaces.revokeLabel', { name: entity.node.name })}
                      onClick={() => onRevoke(entity.node.id, entity.node.name)}
                    >
                      {t('groups.spaces.revoke')}
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <EditRolesDialog
        target={
          editing && {
            title: t('groups.spaces.editRolesTitle', {
              name: editing.node.name,
              group: group.name,
            }),
            roles: editing.roles,
            withoutManaging: group.system !== null,
          }
        }
        onClose={() => setEditing(null)}
        onSave={async (roles) => {
          if (!editing) return
          await setAccess.mutateAsync({
            nodeId: editing.node.id,
            subject: { type: 'group', id: group.id },
            roles,
          })
          toast.success(t('groups.toasts.spaceChanged'))
        }}
      />
    </>
  )
}
