import { createI18n, type PluralizationRule } from 'vue-i18n'
import en from './locales/en.json'
import fr from './locales/fr.json'

type MessageSchema = typeof fr

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

export type AppLocale = 'fr' | 'en'

const SOURCE_LOCALE: AppLocale = 'fr'
const DEVICE_FALLBACK_LOCALE: AppLocale = 'en'

function isAppLocale(code: string): code is AppLocale {
  return code === 'fr' || code === 'en'
}

/** Première langue livrée parmi les préférences du système (`navigator.languages`), sinon l’anglais. */
export function detectLocale(languages: readonly string[]): AppLocale {
  const codes = languages.map((tag) => tag.split('-')[0]!.toLowerCase())

  return codes.find(isAppLocale) ?? DEVICE_FALLBACK_LOCALE
}

const frenchPlural: PluralizationRule = (choice, choicesLength, orgRule) =>
  choicesLength === 2 && choice === 0 ? 0 : orgRule!(choice, choicesLength)

const i18n = createI18n({
  legacy: false,
  locale: SOURCE_LOCALE,
  fallbackLocale: SOURCE_LOCALE,
  messages: { fr, en },
  pluralRules: { fr: frenchPlural },
})

export function applyLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

export function currentLocale(): AppLocale {
  return i18n.global.locale.value
}

export default i18n
