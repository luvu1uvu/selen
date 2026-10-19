import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SUGGESTED_ICONS } from '../emoji'

/**
 * Иконка-эмодзи папки или пространства: поле (можно вставить любую эмодзи) и быстрый выбор.
 * Проверку «одна эмодзи» делает схема формы (isSingleEmoji) и сервер.
 */
export function EmojiField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const { t } = useTranslation('admin')
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-20 text-center text-lg"
          autoComplete="off"
          aria-invalid={invalid}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange('')}
          disabled={!value}
        >
          {t('structure.folder.iconClear')}
        </Button>
      </div>
      <div
        role="group"
        aria-label={t('structure.folder.iconSuggestions')}
        className="flex flex-wrap gap-1"
      >
        {SUGGESTED_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => onChange(icon)}
            aria-pressed={value === icon}
            className={cn(
              'hover:bg-accent flex size-8 items-center justify-center rounded-md text-lg',
              value === icon && 'bg-accent ring-ring ring-1',
            )}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}
