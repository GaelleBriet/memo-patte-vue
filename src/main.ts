import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import { getAnimalsRepository } from '@/features/animals/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/animals.store'
import '@/styles/main.scss'

provideAnimalsRepository(getAnimalsRepository)

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')
