import { createI18n } from 'vue-i18n'
import fr from './locales/fr.json'

type MessageSchema = typeof fr

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

export default createI18n<{ message: MessageSchema }, 'fr'>({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr },
})
