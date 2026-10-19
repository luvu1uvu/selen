import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { FolderKanban } from 'lucide-react'
import { useSpaces } from '@/features/spaces/queries'
import { Badge } from '@/shared/ui/badge'

/** Главная: пространства, к которым у пользователя есть доступ. */
export function HomePage() {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const spacesQuery = useSpaces()

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('home.title')}</h1>

      {spacesQuery.isPending && (
        <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
      )}
      {spacesQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      {spacesQuery.data?.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <FolderKanban className="text-muted-foreground size-10" />
          <p className="text-lg font-medium">{t('home.empty')}</p>
          <p className="text-muted-foreground text-sm">{t('home.emptyHint')}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {spacesQuery.data?.map((space) => (
          <Link
            key={space.id}
            to={`/spaces/${space.key}`}
            className="hover:border-primary/40 grid gap-2 rounded-xl border p-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{space.name}</span>
              <Badge variant="secondary" className="font-mono">
                {space.key}
              </Badge>
            </div>
            {space.description && (
              <p className="text-muted-foreground line-clamp-2 text-sm">{space.description}</p>
            )}
            {space.my_role && (
              <p className="text-muted-foreground text-xs">
                {t('home.yourRole', { role: t(`roles.${space.my_role}`) })}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
