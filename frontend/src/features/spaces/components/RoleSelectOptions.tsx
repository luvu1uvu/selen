import { useTranslation } from 'react-i18next'
import type { SpaceRole } from '@/shared/types/api'

const SPACE_ROLES: SpaceRole[] = ['admin', 'editor', 'commenter']

/**
 * Варианты <option> для выбора роли в пространстве. withoutAdmin — для встроенной группы «Все сотрудники»:
 * роль администратора ей не выдаётся.
 */
export function RoleSelectOptions({ withoutAdmin = false }: { withoutAdmin?: boolean }) {
  const { t } = useTranslation('spaces')
  const roles = withoutAdmin ? SPACE_ROLES.filter((role) => role !== 'admin') : SPACE_ROLES
  return roles.map((role) => (
    <option key={role} value={role}>
      {t(`roles.${role}`)}
    </option>
  ))
}
