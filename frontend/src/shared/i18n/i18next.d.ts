import 'i18next'
import type { defaultNS, resources } from './index'

// Типизация ключей перевода: опечатка в t('...') — ошибка компиляции.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['ru']
  }
}
