import { createI18n } from 'vue-i18n'
import fr from './locales/fr'

export default createI18n({
  legacy: false, // Composition API (`useI18n()`) uniquement, cf. CLAUDE.md
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr },
})
