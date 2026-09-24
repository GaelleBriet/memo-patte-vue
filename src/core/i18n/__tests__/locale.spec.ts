import { afterEach, describe, expect, it } from 'vitest'

import i18n, { applyLocale, detectLocale } from '..'

describe('detectLocale', () => {
  it('suit la langue du système quand elle est livrée', () => {
    expect(detectLocale(['en-US'])).toBe('en')
    expect(detectLocale(['fr-FR'])).toBe('fr')
    expect(detectLocale(['en-GB'])).toBe('en')
    expect(detectLocale(['fr-CA'])).toBe('fr')
  })

  it('prend la première langue livrée parmi les préférences', () => {
    expect(detectLocale(['de-DE', 'en-US', 'fr-FR'])).toBe('en')
  })

  it('ignore la casse et les codes courts', () => {
    expect(detectLocale(['EN'])).toBe('en')
  })

  it('se replie sur le français', () => {
    expect(detectLocale(['de-DE', 'es'])).toBe('fr')
    expect(detectLocale([])).toBe('fr')
  })
})

describe('applyLocale', () => {
  afterEach(() => applyLocale('fr'))

  it('bascule vue-i18n et la langue du document', () => {
    applyLocale('en')

    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.t('nav.home')).toBe('Home')
    expect(document.documentElement.lang).toBe('en')
  })

  it('reste en français par défaut', () => {
    expect(i18n.global.locale.value).toBe('fr')
    expect(i18n.global.t('nav.home')).toBe('Accueil')
  })
})

describe('pluriels anglais', () => {
  afterEach(() => applyLocale('fr'))

  it('accorde les unités au nombre', () => {
    applyLocale('en')
    const { t } = i18n.global

    expect(t('animals.age.month', 1)).toBe('1 month')
    expect(t('animals.age.month', 5)).toBe('5 months')
    expect(t('animals.age.week', 0)).toBe('less than a week')
    expect(t('treatments.frequency.month', 1)).toBe('Every month')
    expect(t('treatments.frequency.month', 3)).toBe('Every 3 months')
    expect(t('home.todo.count', { n: 1 }, 1)).toBe('1 reminder')
  })
})

// Décision du 2026-09-16 (#282) : le type est porté par l'icône de la ligne et par
// le canal de notification, jamais par un mot collé devant le nom que l'utilisateur
// a saisi — sinon « Vaccin Vaccin antirabique ».
describe('rappels de vaccin', () => {
  afterEach(() => applyLocale('fr'))

  it('titrent la notification sans redoubler le type non plus', () => {
    const named = { name: 'Vaccin antirabique', animal: 'Milo', days: 3 }

    expect(i18n.global.t('reminders.vaccination.beforeTitle', named)).toBe(
      'Vaccin antirabique de Milo dans 3 jours',
    )
    expect(i18n.global.t('reminders.vaccination.dueTitle', named)).toBe(
      'Vaccin antirabique de Milo aujourd’hui',
    )

    applyLocale('en')

    expect(
      i18n.global.t('reminders.vaccination.beforeTitle', { ...named, name: 'Rabies vaccine' }),
    ).toBe('Rabies vaccine for Milo in 3 days')
  })
})

describe('patron des formulaires', () => {
  afterEach(() => applyLocale('fr'))

  it('nomme « Créer » le bouton des trois formulaires en création', () => {
    for (const forme of ['animals', 'vaccinations', 'treatments'] as const) {
      expect(i18n.global.t(`${forme}.form.submit`)).toBe('Créer')
      expect(i18n.global.t(`${forme}.form.submitting`)).toBe('Création…')
    }

    applyLocale('en')

    for (const forme of ['animals', 'vaccinations', 'treatments'] as const) {
      expect(i18n.global.t(`${forme}.form.submit`)).toBe('Create')
      expect(i18n.global.t(`${forme}.form.submitting`)).toBe('Creating…')
    }
  })
})
