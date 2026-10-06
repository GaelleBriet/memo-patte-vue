import { afterEach, describe, expect, it } from 'vitest'

import { animalAge, animalAgeText } from '../domain/animal-age'
import i18n, { applyLocale } from '@/core/i18n'

const TODAY = '2026-09-09'
const t = i18n.global.t

afterEach(() => applyLocale('fr'))

describe('animalAge', () => {
  it('compte en années révolues à partir d’un an', () => {
    expect(animalAge('2022-03-12', TODAY)).toEqual({ unit: 'year', value: 4 })
    expect(animalAge('2025-09-09', TODAY)).toEqual({ unit: 'year', value: 1 })
  })

  it('ne fête pas l’anniversaire avant le jour même', () => {
    expect(animalAge('2025-09-10', TODAY)).toEqual({ unit: 'month', value: 11 })
  })

  it('compte en mois révolus après 16 semaines et sous un an', () => {
    expect(animalAge('2026-03-09', TODAY)).toEqual({ unit: 'month', value: 6 })
    expect(animalAge('2025-10-09', TODAY)).toEqual({ unit: 'month', value: 11 })
  })

  it('compte en semaines révolues jusqu’à 16 semaines', () => {
    expect(animalAge('2026-08-19', TODAY)).toEqual({ unit: 'week', value: 3 })
    expect(animalAge('2026-08-09', TODAY)).toEqual({ unit: 'week', value: 4 })
    expect(animalAge('2026-05-27', TODAY)).toEqual({ unit: 'week', value: 15 })
    expect(animalAge('2026-05-20', TODAY)).toEqual({ unit: 'week', value: 16 })
    expect(animalAge('2026-05-14', TODAY)).toEqual({ unit: 'week', value: 16 })
  })

  it('passe en mois à 17 semaines', () => {
    expect(animalAge('2026-05-13', TODAY)).toEqual({ unit: 'month', value: 3 })
  })

  it('donne zéro semaine sous sept jours, jamais une valeur négative', () => {
    expect(animalAge('2026-09-05', TODAY)).toEqual({ unit: 'week', value: 0 })
    expect(animalAge(TODAY, TODAY)).toEqual({ unit: 'week', value: 0 })
  })

  it('rend null sans date de naissance', () => {
    expect(animalAge(null, TODAY)).toBeNull()
  })

  it('seul `today` décide, jamais l’horloge', () => {
    expect(animalAge('2022-03-12', '2030-01-01')).toEqual({ unit: 'year', value: 7 })
  })
})

describe('animalAgeText', () => {
  it('dit l’âge exact sans « environ »', () => {
    expect(animalAgeText(t, { birthDate: '2026-07-01', approximate: false }, TODAY)).toBe(
      '10 semaines',
    )
    expect(animalAgeText(t, { birthDate: '2022-03-12', approximate: false }, TODAY)).toBe('4 ans')
  })

  it('précède l’âge d’« environ » quand la date est approximative', () => {
    expect(animalAgeText(t, { birthDate: '2026-07-01', approximate: true }, TODAY)).toBe(
      'environ 10 semaines',
    )
    expect(animalAgeText(t, { birthDate: '2026-04-09', approximate: true }, TODAY)).toBe(
      'environ 5 mois',
    )
    expect(animalAgeText(t, { birthDate: '2024-09-09', approximate: true }, TODAY)).toBe(
      'environ 2 ans',
    )
  })

  it('ne dit pas « environ moins d’une semaine »', () => {
    expect(animalAgeText(t, { birthDate: '2026-09-07', approximate: true }, TODAY)).toBe(
      'moins d’une semaine',
    )
  })

  it('rend null sans date de naissance', () => {
    expect(animalAgeText(t, { birthDate: null, approximate: false }, TODAY)).toBeNull()
  })

  it('parle anglais', () => {
    applyLocale('en')

    expect(animalAgeText(t, { birthDate: '2026-07-01', approximate: true }, TODAY)).toBe(
      'about 10 weeks',
    )
    expect(animalAgeText(t, { birthDate: '2025-09-09', approximate: false }, TODAY)).toBe('1 year')
  })
})
