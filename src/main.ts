import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from '@/core/theme/vuetify'
import i18n, { applyLocale, detectLocale } from '@/core/i18n'
import { getAnimalsRepository } from '@/features/animals/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/animals.store'
import { getTreatmentsRepository } from '@/features/treatments/treatments.repository'
import { provideTreatmentsRepository } from '@/features/treatments/treatments.store'
import { getVaccinationsRepository } from '@/features/vaccinations/vaccinations.repository'
import { provideVaccinationsRepository } from '@/features/vaccinations/vaccinations.store'
import { getWeightRepository } from '@/features/weight/weight.repository'
import { provideWeightRepository } from '@/features/weight/weight.store'
import '@/styles/main.scss'

provideAnimalsRepository(getAnimalsRepository)
provideVaccinationsRepository(getVaccinationsRepository)
provideWeightRepository(getWeightRepository)
provideTreatmentsRepository(getTreatmentsRepository)

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)
applyLocale(detectLocale(navigator.languages))

// Fixtures de développement (`pnpm dev:data`) : import dynamique derrière
// `import.meta.env.DEV`, le module tombe au build. Avant le montage, pour que
// les stores lisent une base déjà prête ; un échec ne bloque pas l'app.
if (import.meta.env.DEV) {
  const { applyDevFixtures } = await import('@/core/dev/fixtures')
  await applyDevFixtures()
}

app.mount('#app')
