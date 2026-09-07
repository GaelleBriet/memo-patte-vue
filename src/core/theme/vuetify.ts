import 'vuetify/styles'
// Polices auto-hébergées : rien n'est chargé depuis Google Fonts à l'exécution.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import { createVuetify } from 'vuetify'

import MsIcon from './MsIcon.vue'
import { msAliases } from './icons'

/**
 * Palette du thème clair — maquettes v2, tables « Tokens » de
 * `docs/design/accueil-v2/accueil.md` et `docs/design/carnet-v2/carnet.md`.
 * Les couleurs de détail (filets, bordures, badges) et la géométrie sont dans
 * `src/styles/_tokens.scss`.
 */
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

    // Pastille « Tout est à jour » : vert distinct de « Bientôt », pas de barre
    // d'urgence associée — juste un fond et la couleur de son icône.
    'up-to-date': '#D8EFDC',
    'on-up-to-date': '#2B6339',

    // Les maquettes ne définissent pas d'accent générique distinct :
    // les rôles Vuetify reprennent les couleurs d'urgence correspondantes.
    error: '#C0453D',
    warning: '#D38D38',
    success: '#5C8664',
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
