import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { companyModeContext } from '@/shared/lib/roles'
import type {
  CompanyPermission,
  GroupCompanyPermission,
  UserCompanyPermission,
} from '@/shared/types/api'
import { Checkbox } from '@/shared/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import {
  useGroupPermissions,
  useSaveGroupPermissions,
  useSaveUserPermissions,
  useUserPermissions,
} from '../queries'

/** Права, которые выдаёт только Владелец (решение PM 23.10, В17). */
const OWNER_GRANTED: CompanyPermission[] = ['company.delete_users', 'company.view_time_analytics']

function permissionKey(permission: CompanyPermission) {
  return permission.replace('.', '_') as
    | 'company_invite_users'
    | 'company_manage_users'
    | 'company_delete_users'
    | 'company_manage_groups'
    | 'company_manage_dictionaries'
    | 'company_manage_roles'
    | 'company_manage_structure'
    | 'company_manage_access'
    | 'company_view_event_log'
    | 'company_manage_trash'
    | 'company_view_time_analytics'
}

type Row = {
  permission: CompanyPermission
  /** Отмечено: выдано лично (группе) или есть у администратора компании. */
  checked: boolean
  /** Выдано лично (группе) — то, что уходит на сервер при сохранении. */
  granted: boolean
  editable: boolean
  /** Есть у администратора компании по умолчанию: галочка отмечена и недоступна (П2c-2). */
  byAdmin: boolean
  /** Откуда право, кроме галочки: администратор компании, группы. */
  note: string | null
}

/**
 * «Права компании» галочками (П2c, аудит Kaiten «права на админ-разделы»): у человека — выданные лично (и откуда
 * ещё есть: роль администратора, группы), у группы — её права; у «Все сотрудники» — права всех новых сотрудников
 * (решение PM 28.10, п. 7). Галочку «удалять пользователей» и «аналитика трудозатрат» меняет только Владелец —
 * у администратора она недоступна, с подсказкой. В копии с одной компанией (ADR-0026) подписи — без гостей.
 * П2c-2 (решения PM по отчёту П2c-1, п. 3 и 4): права администратора компании у него — отмеченные недоступные галочки
 * с подсказкой; любое право группе «Все сотрудники» — после подтверждения.
 */
export function CompanyPermissionsSection(
  props:
    | { userId: string; groupId?: never; everyone?: never }
    | { groupId: string; userId?: never; everyone?: boolean },
) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const context = companyModeContext(me)
  const userQuery = useUserPermissions(props.userId ?? '', props.userId !== undefined)
  const groupQuery = useGroupPermissions(props.groupId ?? '', props.groupId !== undefined)
  const saveUser = useSaveUserPermissions(props.userId ?? '')
  const saveGroup = useSaveGroupPermissions(props.groupId ?? '')
  const save = props.userId !== undefined ? saveUser : saveGroup
  const query = props.userId !== undefined ? userQuery : groupQuery
  // Право остаётся, пока окно закрывается (иначе на время анимации текст стал бы «Право «» получат…»)
  const [toEveryone, setToEveryone] = useState<CompanyPermission | null>(null)
  const [everyoneOpen, setEveryoneOpen] = useState(false)

  const rows: Row[] =
    props.userId !== undefined
      ? (userQuery.data ?? []).map((row: UserCompanyPermission) => ({
          permission: row.permission,
          checked: row.personal || row.by_admin_role,
          granted: row.personal,
          // Право администратора компании галочкой не снять и не добавить — оно у него уже есть
          editable: row.editable && !row.by_admin_role,
          byAdmin: row.by_admin_role,
          note:
            [
              // Выданное лично у администратора — не снять галочкой, но видно (ревью П2c-2): после снятия роли оно останется
              row.by_admin_role
                ? t(row.personal ? 'permissions.byAdminAndPersonal' : 'permissions.byAdmin')
                : null,
              row.groups.length > 0
                ? t('permissions.byGroups', { groups: row.groups.map((g) => g.name).join(', ') })
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || null,
        }))
      : (groupQuery.data ?? []).map((row: GroupCompanyPermission) => ({
          permission: row.permission,
          checked: row.granted,
          granted: row.granted,
          editable: row.editable,
          byAdmin: false,
          note: null,
        }))

  const name = (permission: CompanyPermission) =>
    t(`permissions.names.${permissionKey(permission)}`, { context })

  const toggle = async (permission: CompanyPermission, checked: boolean, confirmed = false) => {
    // Пока сохраняется прошлый щелчок, новый ждёт; галочки не отключаем — иначе браузер снимет фокус с нажатой
    if (save.isPending) return
    // Право всем сотрудникам компании (и будущим) — только после подтверждения (решение PM по отчёту П2c-1, п. 3)
    if (props.everyone && checked && !confirmed) {
      setToEveryone(permission)
      setEveryoneOpen(true)
      return
    }
    // Только права, которые автор может менять: выданное Владельцем остаётся как есть (сервер его не трогает); у
    // администратора компании — и выданное лично право из его набора (галочка недоступна, но выдача остаётся)
    const next = rows
      .filter((row) => row.editable && (row.permission === permission ? checked : row.granted))
      .map((row) => row.permission)
    const keep = rows.filter((row) => row.byAdmin && row.granted).map((row) => row.permission)
    try {
      await save.mutateAsync([...next, ...keep])
      toast.success(t('permissions.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  // Смотреть права может только Владелец и администратор компании, цель — действующий сотрудник: иначе раздела нет
  const status = getErrorStatus(query.error)
  if (status === 403 || status === 404) return null

  return (
    <section className="grid gap-2" aria-labelledby="company-permissions-title">
      <h2 id="company-permissions-title" className="text-lg font-semibold">
        {t('permissions.title')}
      </h2>
      <p className="text-muted-foreground max-w-2xl text-sm">
        {props.userId !== undefined
          ? t('permissions.userHint', { context })
          : t('permissions.groupHint')}
      </p>
      {query.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}
      <ul className="grid max-w-2xl gap-2">
        {rows.map((row) => {
          const id = `permission-${row.permission}`
          const box = (
            <Checkbox
              id={id}
              aria-describedby={`${id}-hint`}
              checked={row.checked}
              disabled={!row.editable}
              className="mt-0.5"
              onCheckedChange={(checked) => toggle(row.permission, checked === true)}
            />
          )
          return (
            <li key={row.permission} className="flex items-start gap-2">
              {row.editable ? (
                box
              ) : (
                // Подсказка к недоступной галочке — на обёртке, которая получает фокус (правило 8); у обёртки — имя
                // права, иначе диктор назовёт только подсказку
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      role="group"
                      aria-labelledby={`${id}-label`}
                      aria-describedby={`${id}-hint`}
                      className="inline-flex"
                    >
                      {box}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.byAdmin
                      ? t('permissions.adminHas')
                      : OWNER_GRANTED.includes(row.permission)
                        ? t('permissions.ownerOnly')
                        : t('permissions.readOnly')}
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="grid gap-0.5 text-sm">
                {/* Точка — разделитель ключей i18next: в ключе перевода — «_», как у типов событий */}
                <label id={`${id}-label`} htmlFor={id}>
                  {name(row.permission)}
                </label>
                {/* Что открывает право — выдают осознанно (решение PM 28.10 по аудиту П2c-1); описание галочки */}
                <span id={`${id}-hint`} className="text-muted-foreground text-xs">
                  {t(`permissions.hints.${permissionKey(row.permission)}`, { context })}
                </span>
                {row.note && <span className="text-muted-foreground text-xs">{row.note}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={everyoneOpen}
        onOpenChange={setEveryoneOpen}
        pending={save.isPending}
        confirmVariant="default"
        title={t('permissions.everyoneConfirm.title')}
        description={t('permissions.everyoneConfirm.text', {
          permission: toEveryone ? name(toEveryone) : '',
        })}
        confirmLabel={t('permissions.everyoneConfirm.confirm')}
        onConfirm={async () => {
          if (toEveryone) await toggle(toEveryone, true, true)
          setEveryoneOpen(false)
        }}
      />
    </section>
  )
}
