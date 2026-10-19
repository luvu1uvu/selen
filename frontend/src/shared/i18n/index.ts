import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import admin from './locales/ru/admin.json'
import auth from './locales/ru/auth.json'
import boards from './locales/ru/boards.json'
import common from './locales/ru/common.json'
import profile from './locales/ru/profile.json'
import spaces from './locales/ru/spaces.json'

/**
 * Слой локализации. Все строки интерфейса лежат в locales/<язык>/<namespace>.json.
 * Сейчас поддерживается только русский; чтобы добавить язык — создайте папку
 * locales/<язык> с теми же файлами и добавьте её в resources.
 */
export const resources = {
  ru: { common, auth, profile, admin, spaces, boards },
} as const

export const defaultNS = 'common'

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ru',
  fallbackLng: 'ru',
  defaultNS,
  ns: ['common', 'auth', 'profile', 'admin', 'spaces', 'boards'],
  interpolation: { escapeValue: false },
})

export default i18n
