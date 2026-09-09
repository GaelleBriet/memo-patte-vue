import { describe, expect, it } from 'vitest'
import { animalAge } from '../animal-age'

const TODAY = '2026-09-09'

describe('animalAge', () => {
  it('compte en années révolues à partir d’un an', () => {
    expect(animalAge('2022-03-12', TODAY)).toEqual({ unit: 'year', value: 4 })
    expect(animalAge('2025-09-09', TODAY)).toEqual({ unit: 'year', value: 1 })
  })

  it('ne fête pas l’anniversaire avant le jour même', () => {
    expect(animalAge('2025-09-10', TODAY)).toEqual({ unit: 'month', value: 11 })
  })

  it('compte en mois révolus sous un an', () => {
    expect(animalAge('2026-03-09', TODAY)).toEqual({ unit: 'month', value: 6 })
    expect(animalAge('2026-08-09', TODAY)).toEqual({ unit: 'month', value: 1 })
  })

  it('compte en semaines révolues sous un mois', () => {
    expect(animalAge('2026-08-19', TODAY)).toEqual({ unit: 'week', value: 3 })
    expect(animalAge('2026-09-02', TODAY)).toEqual({ unit: 'week', value: 1 })
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
