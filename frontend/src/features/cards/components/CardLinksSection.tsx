import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail, CardLink } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Hint } from '@/shared/components/Hint'
import { TruncatedTrigger } from '@/shared/components/TruncatedText'
import { linkApi } from '../api'
import { useUnsavedText } from '../cardWindow'
import { useCardContentMutation } from '../queries'

/** Домен ссылки без «www.»; адрес не разобрался — пусто. */
function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Ссылка карточки: название (или адрес); обрезанное — целиком в подсказке у ссылки (правила вида, раздел 6). */
function LinkTitle({ link }: { link: CardLink }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const text = link.title || link.url
  return (
    <TruncatedTrigger text={text} nameRef={ref}>
      <a
        ref={ref}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="min-w-0 truncate hover:underline"
      >
        {text}
      </a>
    </TruncatedTrigger>
  )
}

/**
 * Ссылки на документы, макеты и т. п.: только http и https, необязательное название. Новая — пунктом «+» окна
 * или кнопкой внизу секции (`adding` — форма открыта).
 */
export function CardLinksSection({
  card,
  canEdit,
  adding,
  onAdd,
  onAddDone,
}: {
  card: CardDetail
  canEdit: boolean
  adding: boolean
  onAdd: () => void
  onAddDone: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  useUnsavedText(adding && (url.trim() !== '' || title.trim() !== ''))
  const add = useCardContentMutation((payload: { url: string; title: string | null }) =>
    linkApi.add(card.key, payload),
  )
  const remove = useCardContentMutation((id: string) => linkApi.remove(id))

  const submit = async () => {
    const value = url.trim()
    if (!/^https?:\/\/\S+$/i.test(value)) {
      setError(t('links.invalid'))
      return
    }
    try {
      await add.mutateAsync({ url: value, title: title.trim() || null })
      setUrl('')
      setTitle('')
      setError(null)
      onAddDone()
    } catch (e) {
      toast.error(getErrorMessage(e, tc('errors.generic')))
    }
  }

  return (
    <div className="grid gap-2">
      {card.links.length === 0 && !canEdit && (
        <span className="text-muted-foreground text-sm">{t('links.none')}</span>
      )}
      <ul className="grid gap-1">
        {card.links.map((link) => (
          <li key={link.id} className="flex items-center gap-2 text-sm">
            <ExternalLink className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <LinkTitle link={link} />
            {/* У ссылки с названием — куда она ведёт: домен серым (V-6 UX-ревью UI-1a); без названия адрес и так виден */}
            {link.title && (
              <span className="text-muted-foreground shrink-0 text-xs">{domainOf(link.url)}</span>
            )}
            {canEdit && (
              <Hint label={t('links.remove', { title: link.title || link.url })}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-6"
                  aria-label={t('links.remove', { title: link.title || link.url })}
                  onClick={() =>
                    remove
                      .mutateAsync(link.id)
                      .catch((e) => toast.error(getErrorMessage(e, tc('errors.generic'))))
                  }
                >
                  <Trash2 />
                </Button>
              </Hint>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !adding && (
        <Button variant="ghost" size="sm" className="-ml-2.5 justify-self-start" onClick={onAdd}>
          <Plus />
          {t('links.addMore')}
        </Button>
      )}
      {canEdit && adding && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_12rem_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            aria-label={t('links.url')}
            placeholder="https://"
            value={url}
            autoFocus
            aria-invalid={!!error}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Input
            aria-label={t('links.title')}
            placeholder={t('links.title')}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!url.trim() || add.isPending}>
            {t('links.add')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setUrl('')
              setTitle('')
              setError(null)
              onAddDone()
            }}
          >
            {tc('actions.cancel')}
          </Button>
          {error && <p className="text-destructive text-sm sm:col-span-4">{error}</p>}
        </form>
      )}
    </div>
  )
}
