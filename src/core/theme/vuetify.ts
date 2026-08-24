import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#0F766E', // teal — à ajuster selon tes maquettes
          secondary: '#1B4A52FF',
          surface: '#F8FAFC',
          error: '#DC2626',
          warning: '#D97706',
          success: '#16A34A',
        },
      },
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
})
