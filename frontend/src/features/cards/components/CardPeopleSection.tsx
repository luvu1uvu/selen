import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useMembers } from '@/features/spaces/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { UserAvatar } from '@/shared/components/UserAvatar'
import type { CardDetail, CardPerson } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { FormField } from '@/shared/ui/form-field'
import { NativeSelect } from '@/shared/ui/select'
import { useCardParticipant, useUpdateCard } from '../queries'

/** Человек в карточке: аватар, имя и пометки «приглашён», «деактивирован», «не в пространстве». */
export function PersonLine({ person }: { person: CardPerson }) {
  const { t } = useTranslation('boards')
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <UserAvatar id={person.id} name={person.name} />
      <span className="truncate">{person.name}</span>
      {person.status === 'invited' && <Badge variant="warning">{t('people.invited')}</Badge>}
      {person.status === 'deactivated' && (
        <Badge variant="destructive">{t('people.deactivated')}</Badge>
      )}
      {!person.in_space && <Badge variant="outline">{t('people.notInSpace')}</Badge>}
    </span>
  )
}

/**
 * Заказчик, ответственный и участники. Назначать можно участников пространства (кроме деактивированных);
 * уже назначенные остаются на карточке с пометками. Права и правило «не потерять доступ» проверяет API.
 */
export function CardPeopleSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const members = useMembers(card.space.key, canEdit)
  const update = useUpdateCard(card.key)
  const participant = useCardParticipant(card.key)

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const assignable = (members.data ?? [])
    .filter((member) => member.user.status !== 'deactivated')
    .map((member) => member.user)
  // Уже назначенный, но не назначаемый (деактивирован, исключён) — остаётся в списке выбора
  const options = (current: CardPerson | null) =>
    current && !assignable.some((user) => user.id === current.id)
      ? [current, ...assignable]
      : assignable
  const participantIds = new Set(card.participants.map((person) => person.id))
  const candidates = assignable.filter((user) => !participantIds.has(user.id))

  if (!canEdit) {
    return (
      <div className="grid gap-3 text-sm">
        <ReadonlyRole label={t('people.customer')}>
          <PersonLine person={card.customer} />
        </ReadonlyRole>
        <ReadonlyRole label={t('people.responsible')}>
          {card.responsible ? (
            <PersonLine person={card.responsible} />
          ) : (
            <span className="text-muted-foreground">{t('people.notAssigned')}</span>
          )}
        </ReadonlyRole>
        <ReadonlyRole label={t('people.participants')}>
          {card.participants.length ? (
            <ul className="grid gap-1">
              {card.participants.map((person) => (
                <li key={person.id}>
                  <PersonLine person={person} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">{t('people.none')}</span>
          )}
        </ReadonlyRole>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="card-customer" label={t('people.customer')}>
          <NativeSelect
            id="card-customer"
            value={card.customer.id}
            disabled={update.isPending}
            onChange={(event) => run(() => update.mutateAsync({ customer_id: event.target.value }))}
          >
            {options(card.customer).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="card-responsible" label={t('people.responsible')}>
          <NativeSelect
            id="card-responsible"
            value={card.responsible?.id ?? ''}
            disabled={update.isPending}
            onChange={(event) =>
              run(() => update.mutateAsync({ responsible_id: event.target.value || null }))
            }
          >
            <option value="">{t('people.notAssigned')}</option>
            {options(card.responsible).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {(card.customer.status !== 'active' || !card.customer.in_space) && (
        <PersonLine person={card.customer} />
      )}
      {card.responsible && (card.responsible.status !== 'active' || !card.responsible.in_space) && (
        <PersonLine person={card.responsible} />
      )}

      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs">{t('people.participants')}</span>
        <ul className="grid gap-1 text-sm">
          {card.participants.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-2">
              <PersonLine person={person} />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('people.remove', { name: person.name })}
                disabled={participant.isPending}
                onClick={() =>
                  run(() => participant.mutateAsync({ userId: person.id, add: false }))
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <NativeSelect
          aria-label={t('people.add')}
          value=""
          disabled={participant.isPending || candidates.length === 0}
          onChange={(event) =>
            event.target.value &&
            run(() => participant.mutateAsync({ userId: event.target.value, add: true }))
          }
        >
          <option value="">{t('people.add')}</option>
          {candidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}

function ReadonlyRole({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  )
}
