import { describe, expect, it } from 'vitest'

import vuetify from '../vuetify'
import { contrastRatio, scssColorTokens } from './contrast'

const TEXT = 4.5
const LARGE_TEXT_OR_UI = 3

const theme = vuetify.theme.themes.value.light!.colors
const tokens = scssColorTokens()

function color(name: string): string {
  const value = name.startsWith('$') ? tokens[name.slice(1)] : theme[name]
  if (typeof value !== 'string') throw new Error(`couleur inconnue : ${name}`)
  return value.toUpperCase()
}

// Paires conformes réellement rendues ; les non conformes sont listées dans
// `docs/technical/accessibilite.md`, en attente d'un choix de couleur.
const pairs: [element: string, foreground: string, background: string, minimum: number][] = [
  ['Texte principal sur le fond', 'on-background', 'background', TEXT],
  ['Texte principal sur une carte', 'on-surface', 'surface', TEXT],
  ['Titre et icônes du header pétrole', 'background', 'primary', TEXT],
  ['Sous-titre du header pétrole', '$color-on-primary-subtitle', 'primary', TEXT],
  ['Chip et segment cochés', '$color-on-primary', 'primary', TEXT],
  ['Lien, astérisque, bouton texte sur le fond', 'primary', 'background', TEXT],
  ['Ligne « Ajouter … », icônes sur une carte', 'primary', 'surface', TEXT],
  ['Bouton « Annuler » de la barre d’actions', 'primary', '$color-actions-surface', TEXT],
  ['Badge « En retard », bandeau retard', 'on-overdue-container', 'overdue-container', TEXT],
  ['Badge « Aujourd’hui »', 'on-today-container', 'today-container', TEXT],
  ['Badge « Demain » / « Dans n jours »', 'on-soon-container', 'soon-container', TEXT],
  [
    'Badge « À jour » du Carnet',
    '$color-badge-up-to-date-text',
    '$color-badge-up-to-date-bg',
    TEXT,
  ],
  [
    'Badge de fréquence, « Pas de rappel »',
    '$color-badge-frequency-text',
    '$color-badge-frequency-bg',
    TEXT,
  ],
  ['Coche de la pastille « Tout est à jour »', 'on-up-to-date', 'up-to-date', LARGE_TEXT_OR_UI],
  ['Stat « en retard » du Carnet', 'overdue', 'background', TEXT],
  ['Prochaine dose en retard', 'overdue', 'surface', TEXT],
  ['Prochaine dose aujourd’hui', 'on-today-container', 'surface', TEXT],
  ['Barre d’urgence « en retard »', 'overdue', 'surface', LARGE_TEXT_OR_UI],
  ['Barre d’urgence « bientôt »', 'soon', 'surface', LARGE_TEXT_OR_UI],
  ['Texte secondaire sur le fond', '$color-text-secondary', 'background', TEXT],
  ['Texte secondaire sur une carte', '$color-text-secondary', 'surface', TEXT],
  [
    'Texte secondaire sur une carte de choix cochée',
    '$color-text-secondary',
    '$color-choice-selected-surface',
    TEXT,
  ],
  [
    'Icône du bandeau « rappels désactivés »',
    '$color-text-secondary',
    '$color-reminders-off-surface',
    TEXT,
  ],
  ['Texte méta sur une carte (prochaine dose, mois)', '$color-text-meta', 'surface', TEXT],
  [
    'Compteur de section, stats du Carnet, « Poids actuel »',
    '$color-text-meta',
    'background',
    TEXT,
  ],
  ['Sous-titre des formulaires, « Optionnel », légende photo', '$color-hint', 'background', TEXT],
  ['Placeholder d’un champ', '$color-placeholder', '$color-field-surface', TEXT],
  ['Label de champ', '$color-field-label', 'background', TEXT],
  ['Suffixe d’unité dans un champ', '$color-field-suffix', '$color-field-surface', TEXT],
  ['Unité, « Tous les » sur le fond', '$color-field-suffix', 'background', TEXT],
  ['Segment non coché', '$color-segment-inactive', 'surface', TEXT],
  ['Delta de poids positif sur le fond', '$color-delta-up', 'background', TEXT],
  ['Delta de poids positif sur une carte', '$color-delta-up', 'surface', TEXT],
  ['Delta de poids négatif sur le fond', '$color-delta-down', 'background', TEXT],
  ['Delta de poids négatif sur une carte', '$color-delta-down', 'surface', TEXT],
  ['Delta nul, poids à l’arrivée, sur le fond', '$color-delta-flat', 'background', TEXT],
  ['Delta nul sur une carte', '$color-delta-flat', 'surface', TEXT],
  ['Valeur au-dessus d’un point de courbe', '$color-chart-value', 'surface', TEXT],
  ['Date d’une pesée', '$color-weight-row-date', 'surface', TEXT],
  ['Icône « une seule pesée »', '$color-chart-icon', 'surface', LARGE_TEXT_OR_UI],
  [
    'Titre du bandeau « rappels désactivés »',
    '$color-reminders-off-text',
    '$color-reminders-off-surface',
    TEXT,
  ],
  ['Lien du bandeau « rappels désactivés »', 'primary', '$color-reminders-off-surface', TEXT],
  ['Toast de confirmation', '$color-on-primary', '$color-toast-surface', TEXT],
  ['Chevron d’une ligne de réglage', '$color-settings-chevron', 'surface', LARGE_TEXT_OR_UI],
  ['Carte de choix cochée', 'on-surface', '$color-choice-selected-surface', TEXT],
  [
    'Icône d’une carte de choix cochée',
    'primary',
    '$color-choice-selected-surface',
    LARGE_TEXT_OR_UI,
  ],
  [
    'Icône de l’écran d’explication des notifications',
    'primary',
    '$color-priming-icon-surface',
    LARGE_TEXT_OR_UI,
  ],
  ['Erreur de saisie sur le fond', 'error', 'background', TEXT],
  ['Erreur sur une carte', 'error', 'surface', TEXT],
  ['Icône de la pastille d’erreur d’import', 'error', 'error-container', LARGE_TEXT_OR_UI],
  ['Bouton « Remplacer » de la confirmation d’import', 'on-error', 'error', TEXT],
]

describe('contrastes des paires de couleurs réellement utilisées (WCAG AA)', () => {
  it.each(pairs)('%s : %s sur %s', (_element, foreground, background, minimum) => {
    expect(contrastRatio(color(foreground), color(background))).toBeGreaterThanOrEqual(minimum)
  })

  it('Texte des boutons pleins pétrole : on-primary calculé par Vuetify', () => {
    const onPrimary = vuetify.theme.computedThemes.value.light!.colors['on-primary']

    expect(contrastRatio(String(onPrimary), color('primary'))).toBeGreaterThanOrEqual(TEXT)
  })
})

// Décision du 2026-09-15 : bordures assombries sans aller jusqu'à 3:1, pour garder la douceur des
// maquettes ; ce plancher les empêche de repâlir.
const BORDER_FLOOR = 2
const borders: [element: string, border: string, background: string][] = [
  ['Bordure d’un champ', '$color-field-border', 'background'],
  ['Bordure du sélecteur à boutons', '$color-segmented-border', 'background'],
  ['Pastille radio non cochée', '$color-radio-border', 'surface'],
]

describe('bordures de contrôle, volontairement sous 3:1', () => {
  it.each(borders)('%s : %s sur %s', (_element, border, background) => {
    const ratio = contrastRatio(color(border), color(background))
    expect(ratio).toBeGreaterThanOrEqual(BORDER_FLOOR)
    expect(ratio).toBeLessThan(LARGE_TEXT_OR_UI)
  })
})

describe('lecture des tokens SCSS', () => {
  it('résout un alias vers la couleur qu’il désigne', () => {
    expect(tokens['color-delta-up']).toBe(tokens['color-badge-up-to-date-text'])
  })

  it('refuse un alias vers un token absent ou dans un format non lu', () => {
    expect(() => scssColorTokens('$a: $b;\n$b: rgba(0 0 0 / 50%);')).toThrow(
      'couleur inconnue : $b',
    )
    expect(() => scssColorTokens('$a: $absent;')).toThrow('couleur inconnue : $absent')
  })

  it('lit aussi un token hexadécimal court', () => {
    expect(scssColorTokens('$a: #fff;\n$b: $a;')).toEqual({ a: '#FFF', b: '#FFF' })
  })

  it('refuse de calculer un contraste sur une couleur non reconnue', () => {
    expect(() => contrastRatio('rgba(0, 0, 0, 0.5)', '#FFFFFF')).toThrow(
      'couleur inconnue : rgba(0, 0, 0, 0.5)',
    )
    expect(() => contrastRatio('#FFFFFF', '')).toThrow('couleur inconnue : ')
  })

  it('calcule le rapport de contraste WCAG', () => {
    expect(contrastRatio('#000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#857F79', '#F9F3E9')).toBeCloseTo(3.58, 2)
  })
})
