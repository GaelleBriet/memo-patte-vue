import { describe, expect, it } from 'vitest'
import { formatKg, formatKgDelta, formatLongDate, formatMonth, formatMonthShort } from '../format'

describe('formatKg', () => {
  it('garde une décimale avec la virgule française', () => {
    expect(formatKg(24.5)).toBe('24,5')
    expect(formatKg(24)).toBe('24,0')
    expect(formatKg(3.8)).toBe('3,8')
  })

  it('arrondit à la décimale, jamais deux', () => {
    expect(formatKg(23.64)).toBe('23,6')
    expect(formatKg(23.66)).toBe('23,7')
  })
})

describe('formatKgDelta', () => {
  it('signe une hausse', () => {
    expect(formatKgDelta(0.5)).toBe('+0,5')
  })

  it('signe une baisse avec le signe moins typographique', () => {
    expect(formatKgDelta(-0.3)).toBe('−0,3')
  })

  it('marque ± quand la variation est nulle après arrondi', () => {
    expect(formatKgDelta(0)).toBe('±0,0')
    expect(formatKgDelta(0.04)).toBe('±0,0')
    expect(formatKgDelta(-0.04)).toBe('±0,0')
  })
})

describe('mois et dates', () => {
  it('nomme le mois en toutes lettres, en minuscules', () => {
    expect(formatMonth('2026-08-14')).toBe('août')
    expect(formatMonth('2026-09-01')).toBe('septembre')
  })

  it('abrège le mois avec une majuscule pour les libellés de courbe', () => {
    expect(
      ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map(
        formatMonthShort,
      ),
    ).toEqual(['Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.'])
  })

  it('écrit une date complète courte', () => {
    expect(formatLongDate('2026-11-08')).toBe('8 nov. 2026')
  })
})
