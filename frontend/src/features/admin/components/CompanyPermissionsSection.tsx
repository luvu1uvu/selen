import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors'
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
  checked: boolean
  editable: boolean
  /** Откуда право, кроме галочки: администратор компании, группы. */
  note: string | null
}

/**
 * «Права компании» галочками (П2c, аудит Kaiten «права на админ-разделы»): у человека — выданные лично (и откуда
 * ещё есть: роль администратора, группы), у группы — её права; у «Все сотрудники» — права всех новых сотрудников
 * (решение PM 28.10, п. 7). Галочку «удалять пользователей» и «аналитика трудозатрат» меняет только Владелец —
 * у администратора она недоступна, с подсказкой.
 */
export function CompanyPermissionsSection(
  props: { userId: string; groupId?: never } | { groupId: string; userId?: never },
) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const userQuery = useUserPermissions(props.userId ?? '', props.userId !== undefined)
  const groupQuery = useGroupPermissions(props.groupId ?? '', props.groupId !== undefined)
  const saveUser = useSaveUserPermissions(props.userId ?? '')
  const saveGroup = useSaveGroupPermissions(props.groupId ?? '')
  const save = props.userId !== undefined ? saveUser : saveGroup
  const query = props.userId !== undefined ? userQuery : groupQuery

  const rows: Row[] =
    props.userId !== undefined
      ? (userQuery.data ?? []).map((row: UserCompanyPermission) => ({
          permission: row.permission,
          checked: row.personal,
          editable: row.editable,
          note:
            [
              row.by_admin_role ? t('permissions.byAdmin') : null,
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
          editable: row.editable,
          note: null,
        }))

  const toggle = async (permission: CompanyPermission, checked: boolean) => {
    const next = rows
      .filter((row) => (row.permission === permission ? checked : row.checked))
      .map((row) => row.permission)
    try {
      await save.mutateAsync(next)
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
        {props.userId !== undefined ? t('permissions.userHint') : t('permissions.groupHint')}
      </p>
      {query.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}
      <ul className="grid gap-2">
        {rows.map((row) => {
          const id = `permission-${row.permission}`
          const box = (
            <Checkbox
              id={id}
              checked={row.checked}
              disabled={!row.editable || save.isPending}
              onCheckedChange={(checked) => toggle(row.permission, checked === true)}
            />
          )
          return (
            <li key={row.permission} className="flex items-start gap-2">
              {row.editable ? (
                box
              ) : (
                // Подсказка к недоступной галочке — на обёртке, которая получает фокус (правило 8)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex">
                      {box}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {OWNER_GRANTED.includes(row.permission)
                      ? t('permissions.ownerOnly')
                      : t('permissions.readOnly')}
                  </TooltipContent>
                </Tooltip>
              )}
              <label htmlFor={id} className="grid gap-0.5 text-sm">
                {/* Точка — разделитель ключей i18next: в ключе перевода — «_», как у типов событий */}
                <span>{t(`permissions.names.${permissionKey(row.permission)}`)}</span>
                {row.note && <span className="text-muted-foreground text-xs">{row.note}</span>}
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
