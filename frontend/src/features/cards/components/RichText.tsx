import { lazy, Suspense, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useUnsavedText } from '../cardWindow'

/**
 * Редактор и просмотр Tiptap — отдельным ленивым чанком: на доске они не нужны, пока карточку не открыли.
 */
const Editor = lazy(() => import('@/shared/components/rich-text/RichTextEditor'))
const View = lazy(() => import('@/shared/components/rich-text/RichTextView'))

function Loading() {
  const { t } = useTranslation()
  return <p className="text-muted-foreground text-sm">{t('states.loading')}</p>
}

/** Редактор в окне карточки: несохранённый текст не теряется при закрытии окна молча (useUnsavedText). */
export function LazyRichTextEditor(props: ComponentProps<typeof Editor>) {
  const [dirty, setDirty] = useState(false)
  useUnsavedText(dirty)
  return (
    <Suspense fallback={<Loading />}>
      <Editor {...props} onDirtyChange={setDirty} />
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
