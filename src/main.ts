import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installConsentGate } from '@/app/analytics-consent'
import { backfillCareSignalOnLaunch } from '@/app/care-signal-backfill'
import { installCarnetSettingsReminders } from '@/app/carnet-settings-reminders'
import { installPageviewTracking } from '@/app/analytics-pageview'
import { installReminderActions, reminderActions } from '@/app/reminder-actions'
import { cleanOrphanPhotosOnLaunch } from '@/app/orphan-photos-cleanup'
import { installLaunchPriming } from '@/app/reminders-priming'
import { installRemindersSync } from '@/app/reminders-sync'
import { createDefaultSyncDependencies, installSync } from '@/app/sync'
import { initAnalytics } from '@/core/analytics'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import { registerCurrentDevice } from '@/core/device/register-device'
import { provideRemindersPriming } from '@/core/notifications/reminders-priming'
import { restoreWeightUnit } from '@/core/preferences/weight-unit-preference'
import vuetify from '@/core/theme/vuetify'
import i18n, { applyLocale, detectLocale } from '@/core/i18n'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { installPlusAccountLink } from '@/features/purchase/service/plus-account-link.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { clearExports } from '@/features/settings/logic/export-delivery'
import { getCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { provideCarnetSettingsRepository } from '@/features/settings/store/carnet-settings.store'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { remindersPriming } from '@/features/treatments/service/reminders-priming.service'
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
provideCarnetSettingsRepository(getCarnetSettingsRepository)
provideRemindersPriming(remindersPriming)

const app = createApp(App)

installConsentGate(router)
installPageviewTracking(router)
void initAnalytics()

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)
applyLocale(detectLocale(navigator.languages))
restoreWeightUnit(navigator.languages)

installBackButton()
void clearExports()

// Outils de dev (`dev:data`, `dev:plus`), absents du build : avant le montage, pour que
// les stores lisent une base et un statut Plus déjà prêts.
if (import.meta.env.DEV) {
  const { applyDevPlusStatus } = await import('@/features/purchase/logic/dev-plus-status')
  applyDevPlusStatus(import.meta.env.VITE_DEV_PLAN)
  const { applyDevFixtures } = await import('@/core/dev/fixtures')
  await applyDevFixtures()
}
void registerCurrentDevice()
void backfillCareSignalOnLaunch()

app.mount('#app')
void cleanOrphanPhotosOnLaunch()
installReminderActions(router, reminderActions(router))
installRemindersSync()
installCarnetSettingsReminders()
installLaunchPriming(router)
void usePurchaseStore().verifyKnownStatus()
installPlusAccountLink(() => useAuthStore().userId)
void useAuthStore().restore()
void createDefaultSyncDependencies().then(installSync)
