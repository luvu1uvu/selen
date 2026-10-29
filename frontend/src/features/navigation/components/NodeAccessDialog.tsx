import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { useAdminCompanyId } from '@/features/admin/company'
import { EditRolesDialog } from '@/features/spaces/components/EditRolesDialog'
import { RoleChips, RolesField } from '@/features/spaces/components/RolesField'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { useGroupDirectory } from '@/features/spaces/queries'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { DirectoryUser, NodeAccessGrant, RoleKey } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { NativeSelect } from '@/shared/ui/select'
import { ToggleChip } from '@/shared/ui/toggle-chip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useNodeAccess, useRevokeNodeAccess, useSetNodeAccess } from '../queries'

/** Узел, у которого открыт «Доступ…». */
export interface NodeAccessTarget {
  id: string
  type: 'folder' | 'space'
  name: string
  /** Роли новой выдачи по умолчанию (замена администратора при деактивации — «Администратор»). */
  roles?: RoleKey[]
}

type Subject = { type: 'user' | 'group'; id: string }

/**
 * «Доступ…» папки или пространства (П2d-1; «Структура», меню «⋯» дерева, «Пространства» админки): кто и с какими ролями.
 * Выдачи на сам узел — с действиями (изменить роли, снять); унаследованные с папок выше — с пометкой «через папку X»,
 * меняются в «Доступе…» той папки. Сверху — выдать доступ сотруднику или группе с ролями чипами. Ведёт тот, у кого право
 * компании «управлять доступом».
 */
export function NodeAccessDialog({
  node,
  onClose,
}: {
  node: NodeAccessTarget | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  // Пока окно закрывается (анимация), показываем прежнее название, а не пустое
  const [shown, setShown] = useState<NodeAccessTarget | null>(node)
  if (node !== null && node !== shown) setShown(node)

  return (
    <Dialog open={node !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={tc('actions.close')}
        className="sm:max-w-3xl"
        // Фокус — в поиск сотрудника, первое поле формы (UX-ревью П2d-1, U-5)
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById('access-user')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('structure.access.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {t(
              shown?.type === 'folder'
                ? 'structure.access.folderDescription'
                : 'structure.access.spaceDescription',
            )}
          </DialogDescription>
        </DialogHeader>
        {shown && <NodeAccessContent key={shown.id} node={shown} />}
      </DialogContent>
    </Dialog>
  )
}

function NodeAccessContent({ node }: { node: NodeAccessTarget }) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const access = useNodeAccess(node.id)
  const setAccess = useSetNodeAccess()
  const revoke = useRevokeNodeAccess()
  const [editing, setEditing] = useState<NodeAccessGrant | null>(null)
  const [revoking, setRevoking] = useState<NodeAccessGrant | null>(null)

  const grants = access.data?.grants ?? []
  const direct = grants.filter((grant) => grant.inherited_from === null)
  const subjectOf = (grant: NodeAccessGrant): Subject =>
    grant.user ? { type: 'user', id: grant.user.id } : { type: 'group', id: grant.group?.id ?? '' }
  const nameOf = (grant: NodeAccessGrant) => grant.user?.name ?? grant.group?.name ?? ''

  return (
    <div className="grid gap-6">
      <AddAccessForm
        nodeId={node.id}
        initialRoles={node.roles ?? ['editor']}
        userIds={direct.flatMap((grant) => (grant.user ? [grant.user.id] : []))}
        groupIds={direct.flatMap((grant) => (grant.group ? [grant.group.id] : []))}
      />

      {access.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}
      {access.isPending && <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>}

      {access.isSuccess && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('structure.access.columns.subject')}</TableHead>
              <TableHead>{t('structure.access.columns.roles')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('structure.access.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                  {t('structure.access.empty')}
                </TableCell>
              </TableRow>
            )}
            {grants.map((grant) => {
              const folder = grant.inherited_from
              const name = nameOf(grant)
              return (
                <TableRow key={`${grant.subject}:${subjectOf(grant).id}|${folder?.id ?? ''}`}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {name}
                      {grant.group && (
                        <Badge variant="secondary">
                          {grant.group.system
                            ? t('structure.access.everyoneBadge')
                            : t('structure.access.groupBadge')}
                        </Badge>
                      )}
                      {grant.group?.archived_at && (
                        <Badge variant="warning">{t('structure.access.archivedGroup')}</Badge>
                      )}
                      {grant.user?.guest && (
                        <Badge variant="outline">{t('structure.access.guest')}</Badge>
                      )}
                      {grant.user?.status === 'deactivated' && (
                        <Badge variant="destructive">{t('structure.access.deactivated')}</Badge>
                      )}
                      {grant.user?.status === 'invited' && (
                        <Badge variant="warning">{t('structure.access.invited')}</Badge>
                      )}
                      {folder && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} className="rounded-md">
                              <Badge variant="outline">
                                {t('structure.access.inherited', { folder: folder.name })}
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('structure.access.inheritedHint', { folder: folder.name })}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {grant.user && (
                      <div className="text-muted-foreground text-xs">{grant.user.email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <RoleChips roles={grant.roles} />
                  </TableCell>
                  <TableCell>
                    {/* Унаследованный доступ меняется на своей папке */}
                    {!folder && (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('structure.access.editRolesLabel', { name })}
                          onClick={() => setEditing(grant)}
                        >
                          {t('structure.access.editRoles')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('structure.access.revokeLabel', { name })}
                          onClick={() => setRevoking(grant)}
                        >
                          {t('structure.access.revoke')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <EditRolesDialog
        target={
          editing && {
            title: t('structure.access.editRolesTitle', { name: nameOf(editing) }),
            roles: editing.roles,
            withoutManaging: editing.group?.system != null || editing.user?.guest === true,
          }
        }
        onClose={() => setEditing(null)}
        onSave={async (roles) => {
          if (!editing) return
          await setAccess.mutateAsync({ nodeId: node.id, subject: subjectOf(editing), roles })
          toast.success(t('structure.access.toasts.changed'))
        }}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        pending={revoke.isPending}
        title={t('structure.access.revokeTitle')}
        description={t(
          revoking?.group ? 'structure.access.revokeTextGroup' : 'structure.access.revokeText',
          { name: revoking ? nameOf(revoking) : '', node: node.name },
        )}
        confirmLabel={t('structure.access.revoke')}
        onConfirm={async () => {
          const grant = revoking
          if (grant) {
            try {
              await revoke.mutateAsync({ nodeId: node.id, subject: subjectOf(grant) })
              toast.success(t('structure.access.toasts.revoked'))
            } catch (error) {
              toast.error(getErrorMessage(error, tc('errors.generic')))
            }
          }
          setRevoking(null)
        }}
      />
    </div>
  )
}

/** Выдать доступ сотруднику или группе с ролями чипами. Уже выданным на этот узел — меняют роли в списке. */
function AddAccessForm({
  nodeId,
  initialRoles,
  userIds,
  groupIds,
}: {
  nodeId: string
  initialRoles: RoleKey[]
  userIds: string[]
  groupIds: string[]
}) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const company = useAdminCompanyId()
  const { data: me } = useCurrentUser()
  const [kind, setKind] = useState<'user' | 'group'>('user')
  const [user, setUser] = useState<DirectoryUser | null>(null)
  const [groupId, setGroupId] = useState('')
  const [roles, setRoles] = useState<RoleKey[]>(initialRoles)
  const [subjectError, setSubjectError] = useState<string>()
  const [rolesError, setRolesError] = useState<string>()
  const directory = useGroupDirectory(company, kind === 'group')
  const setAccess = useSetNodeAccess()
  const groups = (directory.data ?? []).filter((group) => !groupIds.includes(group.id))
  const isSystem = groups.find((group) => group.id === groupId)?.system != null

  const reset = () => {
    setUser(null)
    setGroupId('')
    setRoles(initialRoles)
    setSubjectError(undefined)
    setRolesError(undefined)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const subjectId = kind === 'user' ? user?.id : groupId
    if (!subjectId)
      setSubjectError(
        t(kind === 'user' ? 'structure.access.userRequired' : 'structure.access.groupRequired'),
      )
    if (roles.length === 0) setRolesError(ts('rolesField.required'))
    if (!subjectId || roles.length === 0) return
    try {
      await setAccess.mutateAsync({ nodeId, subject: { type: kind, id: subjectId }, roles })
      toast.success(t('structure.access.toasts.granted'))
      reset()
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      const subject = errors?.user_id?.[0] ?? errors?.group_id?.[0]
      if (subject) setSubjectError(subject)
      else if (errors?.roles?.[0]) setRolesError(errors.roles[0])
      else toast.error(getErrorMessage(err, tc('errors.generic')))
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-md border p-4" noValidate>
      <h3 className="text-sm font-semibold">{t('structure.access.addTitle')}</h3>
      {/* Выбранный вариант — как выбранная роль (UX-ревью П2d-1, U-2) */}
      <div role="group" aria-label={t('structure.access.kind')} className="flex gap-2">
        {(['user', 'group'] as const).map((value) => (
          <ToggleChip
            key={value}
            pressed={kind === value}
            onClick={() => {
              setKind(value)
              setSubjectError(undefined)
            }}
          >
            {t(`structure.access.kinds.${value}`)}
          </ToggleChip>
        ))}
      </div>
      {kind === 'user' ? (
        <FormField id="access-user" label={t('structure.access.user')} error={subjectError}>
          <div className="grid gap-2">
            <UserPicker
              id="access-user"
              companyId={company}
              value={user}
              excludeIds={userIds}
              invalid={!!subjectError}
              onChange={(next) => {
                setUser(next)
                setSubjectError(undefined)
              }}
            />
            {!user && me && !userIds.includes(me.id) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  setUser({ id: me.id, name: me.name, email: me.email, status: me.status })
                }
              >
                {t('structure.access.me')}
              </Button>
            )}
          </div>
        </FormField>
      ) : (
        <FormField id="access-group" label={t('structure.access.group')} error={subjectError}>
          <NativeSelect
            id="access-group"
            value={groupId}
            aria-invalid={!!subjectError}
            onChange={(event) => {
              setGroupId(event.target.value)
              setSubjectError(undefined)
              // Встроенной группе роль администратора не выдаётся
              if (groups.find((group) => group.id === event.target.value)?.system)
                setRoles((current) => current.filter((role) => role !== 'admin'))
            }}
          >
            <option value="">{t('structure.access.chooseGroup')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {ts('addGroup.option', { name: group.name, count: group.members_count })}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      <FormField id="access-roles" label={ts('rolesField.label')} error={rolesError}>
        <RolesField
          id="access-roles"
          value={roles}
          onChange={(next) => {
            setRoles(next)
            setRolesError(undefined)
          }}
          withoutManaging={kind === 'group' && isSystem}
          invalid={!!rolesError}
        />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={setAccess.isPending}>
          {t('structure.access.submit')}
        </Button>
      </div>
    </form>
  )
}
