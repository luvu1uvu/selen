import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { DirectoryUser, Space, SpacePerson } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useMembers, useRemoveMember, useUpdateMember } from '../queries'
import { AddMemberDialog } from './AddMemberDialog'
import { AccessSourceBadges } from './AccessSourceBadges'
import { EditRolesDialog } from './EditRolesDialog'
import { RoleChips } from './RolesField'
import { SpaceGroupsPanel } from './SpaceGroupsPanel'

/**
 * Участники пространства: вкладки «Люди» (все, у кого есть доступ, и откуда он: лично, группа, через папку — с ролями,
 * П2d-1) и «Группы». Личные роли на самом пространстве — чипами, меняются окном «Роли»; унаследованные с папок —
 * в «Доступе…» папки. Пользователю только с режимом «только свои карточки» источники доступа не показываются —
 * он видит только список людей (их отдаёт API без ролей и групп).
 */
export function MembersPanel({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')

  if (!space.permissions.view_access_sources) {
    return <PeopleTable space={space} />
  }

  return (
    <Tabs defaultValue="people">
      <TabsList>
        <TabsTrigger value="people">{t('members.tabs.people')}</TabsTrigger>
        <TabsTrigger value="groups">{t('members.tabs.groups')}</TabsTrigger>
      </TabsList>
      <TabsContent value="people">
        <PeopleTable space={space} />
      </TabsContent>
      <TabsContent value="groups">
        <SpaceGroupsPanel space={space} />
      </TabsContent>
    </Tabs>
  )
}

function PeopleTable({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const membersQuery = useMembers(space.key)
  const changeMember = useUpdateMember(space.key)
  const removeMember = useRemoveMember(space.key)
  const [toRemove, setToRemove] = useState<SpacePerson | null>(null)
  const [toAdd, setToAdd] = useState<DirectoryUser | null>(null)
  const [editing, setEditing] = useState<SpacePerson | null>(null)
  const canManage = space.permissions.manage
  const showSources = space.permissions.view_access_sources

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const people = membersQuery.data ?? []
  const personalIds = people.filter((person) => person.personal).map((person) => person.user.id)
  // Есть ли источники кроме личных ролей на самом пространстве — от них текст подтверждения исключения
  const hasOtherSources = (person: SpacePerson) =>
    (person.sources ?? []).some((source) => source.type === 'group' || source.folder !== null)

  return (
    <div className="grid gap-4">
      {canManage && (
        <div className="flex justify-end">
          <AddMemberDialog
            spaceKey={space.key}
            companyId={space.company_id}
            memberIds={personalIds}
          />
        </div>
      )}

      {membersQuery.isError && (
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('members.columns.name')}</TableHead>
            {canManage && (
              <>
                <TableHead>{t('members.columns.personalRoles')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('members.columns.actions')}</span>
                </TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => {
            const personal = person.personal ?? null
            return (
              <TableRow key={person.user.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {person.user.name}
                    {person.user.id === me?.id && (
                      <Badge variant="outline">{tc('badges.you')}</Badge>
                    )}
                    {person.user.guest && (
                      // Гость — сотрудник другой компании с личным доступом (П2c); откуда он — не показываем
                      <Badge variant="outline">{t('members.guest')}</Badge>
                    )}
                    {person.user.status === 'deactivated' && (
                      <Badge variant="destructive">{t('members.deactivated')}</Badge>
                    )}
                    {person.user.status === 'invited' && (
                      <Badge variant="warning">{t('members.invited')}</Badge>
                    )}
                  </div>
                  {/* Гостю люди компании-хозяина — только по имени (решение PM 28.10) */}
                  {person.user.email && (
                    <div className="text-muted-foreground text-xs">{person.user.email}</div>
                  )}
                  {showSources && (
                    <div className="mt-1">
                      <AccessSourceBadges person={person} />
                    </div>
                  )}
                </TableCell>
                {canManage && (
                  <>
                    <TableCell>
                      {personal ? (
                        <RoleChips roles={personal.roles} />
                      ) : (
                        <span className="text-muted-foreground text-sm whitespace-nowrap">
                          {t('members.noPersonal')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {personal ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('members.editRolesLabel', { name: person.user.name })}
                              onClick={() => setEditing(person)}
                            >
                              {t('members.editRoles')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('members.removeLabel', { name: person.user.name })}
                              onClick={() => setToRemove(person)}
                            >
                              {t('members.remove')}
                            </Button>
                          </>
                        ) : (
                          person.user.status !== 'deactivated' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('members.addPersonallyLabel', {
                                name: person.user.name,
                              })}
                              onClick={() =>
                                setToAdd({ ...person.user, email: person.user.email ?? '' })
                              }
                            >
                              {t('members.addPersonally')}
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {canManage && (
        <AddMemberDialog
          spaceKey={space.key}
          companyId={space.company_id}
          memberIds={personalIds}
          presetUser={toAdd}
          onClose={() => setToAdd(null)}
        />
      )}

      <EditRolesDialog
        target={
          editing && {
            title: t('members.editRolesTitle', { name: editing.user.name }),
            description: t('members.editRolesDescription'),
            roles: editing.personal?.roles ?? [],
            withoutManaging: editing.user.guest,
          }
        }
        onClose={() => setEditing(null)}
        onSave={async (roles) => {
          if (!editing) return
          await changeMember.mutateAsync({ userId: editing.user.id, roles })
          toast.success(t('members.roleChanged'))
        }}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        pending={removeMember.isPending}
        title={t('members.removeTitle')}
        description={t(
          toRemove && hasOtherSources(toRemove)
            ? 'members.removeTextKeepsGroups'
            : 'members.removeText',
          { name: toRemove?.user.name ?? '' },
        )}
        confirmLabel={t('members.remove')}
        onConfirm={async () => {
          if (toRemove) {
            await run(() => removeMember.mutateAsync(toRemove.user.id), t('members.removed'))
          }
          setToRemove(null)
        }}
      />
    </div>
  )
}
