import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { DirectoryUser, Space, SpacePerson, SpaceRole } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useMembers, useRemoveMember, useUpdateMember } from '../queries'
import { AddMemberDialog } from './AddMemberDialog'
import { AccessSourceBadges } from './AccessSourceBadges'
import { RoleSelectOptions } from './RoleSelectOptions'
import { SpaceGroupsPanel } from './SpaceGroupsPanel'

/**
 * Участники пространства: вкладки «Люди» (все, у кого есть доступ, и откуда он) и «Группы».
 * Пользователю только с режимом «только свои карточки» источники доступа не показываются —
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
                <TableHead>{t('members.columns.personalRole')}</TableHead>
                <TableHead>{t('members.columns.restriction')}</TableHead>
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
                        <NativeSelect
                          aria-label={t('members.roleLabel', { name: person.user.name })}
                          value={personal.role}
                          disabled={changeMember.isPending}
                          onChange={(event) =>
                            run(
                              () =>
                                changeMember.mutateAsync({
                                  userId: person.user.id,
                                  role: event.target.value as SpaceRole,
                                }),
                              t('members.roleChanged'),
                            )
                          }
                        >
                          <RoleSelectOptions withoutAdmin={person.user.guest} />
                        </NativeSelect>
                      ) : (
                        <span className="text-muted-foreground text-sm whitespace-nowrap">
                          {t('members.noPersonal')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {personal && personal.role !== 'admin' && (
                        <div
                          className="flex items-center gap-2"
                          title={t('members.ownCardsOnlyHint')}
                        >
                          <Checkbox
                            id={`own-cards-${person.user.id}`}
                            aria-label={t('members.ownCardsOnlyLabel', { name: person.user.name })}
                            checked={personal.own_cards_only}
                            disabled={changeMember.isPending}
                            onCheckedChange={(checked) =>
                              run(
                                () =>
                                  changeMember.mutateAsync({
                                    userId: person.user.id,
                                    own_cards_only: checked === true,
                                  }),
                                checked === true
                                  ? t('members.restrictionOn')
                                  : t('members.restrictionOff'),
                              )
                            }
                          />
                          <label
                            htmlFor={`own-cards-${person.user.id}`}
                            className="text-sm whitespace-nowrap"
                          >
                            {t('members.ownCardsOnly')}
                          </label>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {personal ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('members.removeLabel', { name: person.user.name })}
                          onClick={() => setToRemove(person)}
                        >
                          {t('members.remove')}
                        </Button>
                      ) : (
                        person.user.status !== 'deactivated' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('members.addPersonallyLabel', { name: person.user.name })}
                            onClick={() =>
                              setToAdd({ ...person.user, email: person.user.email ?? '' })
                            }
                          >
                            {t('members.addPersonally')}
                          </Button>
                        )
                      )}
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

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        pending={removeMember.isPending}
        title={t('members.removeTitle')}
        description={t(
          (toRemove?.groups?.length ?? 0) > 0
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
