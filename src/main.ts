import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installConsentGate } from '@/app/analytics-consent'
import { installPageviewTracking } from '@/app/analytics-pageview'
import { installLaunchPriming } from '@/app/reminders-priming'
import { installRemindersSync } from '@/app/reminders-sync'
import { createDefaultSyncDependencies, installSync } from '@/app/sync'
import { initAnalytics } from '@/core/analytics'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import vuetify from '@/core/theme/vuetify'
import i18n, { applyLocale, detectLocale } from '@/core/i18n'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { installPlusAccountLink } from '@/features/purchase/service/plus-account-link.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { clearExports } from '@/features/settings/logic/export-delivery'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { provideTreatmentsRepository } from '@/features/treatments/store/treatments.store'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { provideVaccinationsRepository } from '@/features/vaccinations/store/vaccinations.store'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { provideWeightRepository } from '@/features/weight/store/weight.store'
import '@/styles/main.scss'

provideAnimalsRepository(getAnimalsRepository)
provideVaccinationsRepository(getVaccinationsRepository)
provideWeightRepository(getWeightRepository)
provideTreatmentsRepository(getTreatmentsRepository)

const app = createApp(App)

installConsentGate(router)
installPageviewTracking(router)
void initAnalytics()

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)
applyLocale(detectLocale(navigator.languages))

installBackButton()
void clearExports()

// Outils de développement (`pnpm dev:data`, `pnpm dev:plus`) : import dynamique derrière
// `import.meta.env.DEV`, les modules tombent au build. Avant le montage, pour que
// les stores lisent une base et un statut Plus déjà prêts ; un échec ne bloque pas l'app.
if (import.meta.env.DEV) {
  const { applyDevPlusStatus } = await import('@/features/purchase/logic/dev-plus-status')
  applyDevPlusStatus(import.meta.env.VITE_DEV_PLAN)
  const { applyDevFixtures } = await import('@/core/dev/fixtures')
  await applyDevFixtures()
}

app.mount('#app')
installRemindersSync()
installLaunchPriming(router)
void usePurchaseStore().verifyKnownStatus()
installPlusAccountLink(() => useAuthStore().userId)
void useAuthStore().restore()
void createDefaultSyncDependencies().then(installSync)
