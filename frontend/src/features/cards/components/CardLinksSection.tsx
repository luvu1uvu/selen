import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { linkApi } from '../api'
import { useCardContentMutation } from '../queries'

/** Ссылки на документы, макеты и т. п.: только http и https, необязательное название. */
export function CardLinksSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
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
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="truncate hover:underline"
              title={link.url}
            >
              {link.title || link.url}
            </a>
            {canEdit && (
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
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            aria-label={t('links.url')}
            placeholder="https://"
            value={url}
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
            <Plus />
            {t('links.add')}
          </Button>
          {error && <p className="text-destructive text-sm sm:col-span-3">{error}</p>}
        </form>
      )}
    </div>
  )
}
