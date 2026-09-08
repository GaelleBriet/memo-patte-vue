import 'vuetify/styles'
// Polices auto-hébergées : rien n'est chargé depuis Google Fonts à l'exécution.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import { createVuetify } from 'vuetify'

import MsIcon from './MsIcon.vue'
import { msAliases } from './icons'

const light = {
  dark: false,
  colors: {
    background: '#F9F3E9', // Fond d'écran
    surface: '#FEFCF9', // Surface carte
    'on-background': '#221B16', // Texte principal
    'on-surface': '#221B16',

    primary: '#01383E', // Pétrole (header, actif, boutons)
    'primary-darken-1': '#012A2F', // Pétrole foncé (hover lien)

    // Urgences : une couleur de barre, plus le couple fond / texte du badge.
    overdue: '#C0453D',
    'overdue-container': '#FFF0ED',
    'on-overdue-container': '#971B1A',
    today: '#D38D38',
    'today-container': '#FDF3E5',
    'on-today-container': '#834200',
    soon: '#5C8664',
    'soon-container': '#EDF7EE',
    'on-soon-container': '#265331',

    // Pastille « Tout est à jour » : vert distinct de « Bientôt », sans barre d'urgence.
    'up-to-date': '#D8EFDC',
    'on-up-to-date': '#2B6339',

    // Rôles système Vuetify, volontairement distincts des urgences métier :
    // une erreur de saisie n'est pas un vaccin en retard.
    error: '#B3261E',
    'on-error': '#FFFFFF',
    'error-container': '#F9DEDC',
    'on-error-container': '#410E0B',
    warning: '#8A5A00',
    'on-warning': '#FFFFFF',
    'warning-container': '#FFE8C2',
    'on-warning-container': '#4A2E00',
    success: '#2E6B3F',
    'on-success': '#FFFFFF',
    'success-container': '#D5EEDB',
    'on-success-container': '#0F3A1D',
  },
}

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: { light },
  },
  icons: {
    defaultSet: 'ms',
    aliases: msAliases,
    sets: { ms: { component: MsIcon } },
  },
})
