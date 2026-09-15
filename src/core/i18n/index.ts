import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import fr from './locales/fr.json'

type MessageSchema = typeof fr

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

export type AppLocale = 'fr' | 'en'

const FALLBACK_LOCALE: AppLocale = 'fr'

function isAppLocale(code: string): code is AppLocale {
  return code === 'fr' || code === 'en'
}

/** Première langue livrée parmi les préférences du système (`navigator.languages`), sinon le français. */
export function detectLocale(languages: readonly string[]): AppLocale {
  const codes = languages.map((tag) => tag.split('-')[0]!.toLowerCase())

  return codes.find(isAppLocale) ?? FALLBACK_LOCALE
}

const i18n = createI18n({
  legacy: false,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: { fr, en },
})

export function applyLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

export function currentLocale(): AppLocale {
  return i18n.global.locale.value
}

export default i18n
