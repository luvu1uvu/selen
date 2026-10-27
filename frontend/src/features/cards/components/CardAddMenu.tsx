import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlarmClock,
  Ban,
  CornerLeftUp,
  CornerRightDown,
  FileUp,
  Hourglass,
  Link2,
  ListChecks,
  Plus,
  Search,
  Tag,
} from 'lucide-react'
import { ActionsMenu, type OpensDialog } from '@/shared/components/ActionsMenu'
import { DropdownMenuItem, DropdownMenuLabel } from '@/shared/ui/dropdown-menu'
import type { AddKind } from '../cardWindow'
import { useCustomFieldOptions, type CustomFieldOption } from '../customFields'

interface AddItem {
  key: string
  icon: ReactNode
  label: string
  onSelect: (opensDialog: OpensDialog) => () => void
}

/**
 * Меню «+» окна карточки — как в Kaiten (LATER-97): две колонки. Слева — системные пункты группами «Основное», «Связи»,
 * «Остальное», только разрешённые (комментатору — только «Загрузить файл»). Справа — «Поля»: пользовательские поля
 * этапа 5; пока поиск и «Создать новое поле» неактивны, полей нет. Колонка «Поля» — только тому, кто правит карточку.
 */
export function CardAddMenu({
  canEdit,
  canAttach,
  onAdd,
  onPickFiles,
}: {
  canEdit: boolean
  canAttach: boolean
  onAdd: (kind: AddKind) => void
  onPickFiles: () => void
}) {
  const { t } = useTranslation('boards')
  const fields = useCustomFieldOptions()
  // Форма или выбор открывается кадром позже, когда меню вернуло фокус на «+» (ActionsMenu, opensDialog)
  const item = (key: AddKind, icon: ReactNode): AddItem => ({
    key,
    icon,
    label: t(`card.addMenu.${key}`),
    onSelect: (opensDialog) => opensDialog(() => onAdd(key)),
  })

  const groups: { title: string; items: AddItem[] }[] = [
    {
      title: t('card.addMenu.main'),
      items: [
        ...(canEdit
          ? [
              item('due', <AlarmClock />),
              item('labels', <Tag />),
              item('estimate', <Hourglass />),
              item('checklist', <ListChecks />),
              item('link', <Link2 />),
            ]
          : []),
        ...(canAttach
          ? [
              {
                key: 'file',
                icon: <FileUp />,
                label: t('card.addMenu.file'),
                onSelect: () => onPickFiles,
              },
            ]
          : []),
      ],
    },
    {
      title: t('card.addMenu.relations'),
      items: canEdit ? [item('parent', <CornerLeftUp />), item('child', <CornerRightDown />)] : [],
    },
    {
      title: t('card.addMenu.other'),
      items: canEdit ? [item('block', <Ban />)] : [],
    },
  ].filter((group) => group.items.length > 0)

  return (
    <ActionsMenu
      label={t('card.add')}
      align="start"
      icon={<Plus />}
      className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground relative rounded-full shadow-md dark:shadow-none"
      contentClassName="flex max-w-[calc(100vw-2rem)] flex-wrap p-0"
    >
      {(opensDialog) => (
        <>
          <div className="min-w-56 flex-1 p-1">
            {groups.map((group) => (
              <div key={group.title} role="group" aria-label={group.title}>
                <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((entry) => (
                  <DropdownMenuItem key={entry.key} onSelect={entry.onSelect(opensDialog)}>
                    {entry.icon}
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </div>
          {canEdit && <CardFieldsColumn fields={fields} />}
        </>
      )}
    </ActionsMenu>
  )
}

/**
 * Колонка «Поля» меню «+» (LATER-97): заголовок, поиск, «Создать новое поле» и список полей. До этапа 5 поиск и создание
 * неактивны, список пустой — с подсказкой «Пользовательские поля появятся позже». Этап 5 передаёт сюда поля и включает
 * поиск, создание (по правам) и добавление поля в карточку.
 */
function CardFieldsColumn({ fields }: { fields: CustomFieldOption[] }) {
  const { t } = useTranslation('boards')
  const hintId = useId()
  const pending = fields.length === 0

  return (
    <div
      role="group"
      aria-label={t('card.addMenu.fields')}
      className="w-64 max-w-full flex-1 border-l p-1 max-sm:border-t max-sm:border-l-0"
    >
      <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
        {t('card.addMenu.fields')}
      </DropdownMenuLabel>
      <div className="px-2 py-1">
        <div className="border-input flex h-8 items-center gap-2 rounded-md border px-2 opacity-50">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            disabled={pending}
            aria-label={t('card.addMenu.fieldsSearch')}
            aria-describedby={hintId}
            placeholder={t('card.addMenu.fieldsSearchPlaceholder')}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          />
        </div>
      </div>
      <DropdownMenuItem disabled={pending} aria-describedby={hintId}>
        <Plus />
        {t('card.addMenu.fieldsCreate')}
      </DropdownMenuItem>
      {fields.map((field) => (
        <DropdownMenuItem key={field.id}>{field.name}</DropdownMenuItem>
      ))}
      {pending && (
        <p id={hintId} className="text-muted-foreground px-2 py-1.5 text-xs">
          {t('card.addMenu.fieldsLater')}
        </p>
      )}
    </div>
  )
}
