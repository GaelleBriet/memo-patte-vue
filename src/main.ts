import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import { getAnimalsRepository } from '@/features/animals/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/animals.store'
import { getVaccinationsRepository } from '@/features/vaccinations/vaccinations.repository'
import { provideVaccinationsRepository } from '@/features/vaccinations/vaccinations.store'
import { getWeightRepository } from '@/features/weight/weight.repository'
import { provideWeightRepository } from '@/features/weight/weight.store'
import '@/styles/main.scss'

provideAnimalsRepository(getAnimalsRepository)
provideVaccinationsRepository(getVaccinationsRepository)
provideWeightRepository(getWeightRepository)

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')
