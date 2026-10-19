import { lazy, Suspense, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Редактор и просмотр Tiptap — отдельным ленивым чанком: на доске они не нужны, пока карточку не открыли.
 */
const Editor = lazy(() => import('@/shared/components/rich-text/RichTextEditor'))
const View = lazy(() => import('@/shared/components/rich-text/RichTextView'))

function Loading() {
  const { t } = useTranslation()
  return <p className="text-muted-foreground text-sm">{t('states.loading')}</p>
}

export function LazyRichTextEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={<Loading />}>
      <Editor {...props} />
    </Suspense>
  )
}

export function LazyRichTextView(props: ComponentProps<typeof View>) {
  return (
    <Suspense fallback={<Loading />}>
      <View {...props} />
    </Suspense>
  )
}
