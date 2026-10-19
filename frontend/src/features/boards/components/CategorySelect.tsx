import { useTranslation } from 'react-i18next'
import type { ColumnCategory } from '@/shared/types/api'
import { NativeSelect } from '@/shared/ui/select'

const CATEGORIES: ColumnCategory[] = ['queue', 'in_progress', 'done']

export function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ColumnCategory
  onChange: (value: ColumnCategory) => void
}) {
  const { t } = useTranslation('boards')
  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as ColumnCategory)}
    >
      {CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {t(`categories.${category}`)}
        </option>
      ))}
    </NativeSelect>
  )
}
