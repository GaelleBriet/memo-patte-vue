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
