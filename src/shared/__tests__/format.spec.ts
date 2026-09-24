import { afterEach, describe, expect, it } from 'vitest'
import {
  formatKg,
  formatKgAxis,
  formatKgDelta,
  formatFullDate,
  formatLongDate,
  formatMonth,
  formatMonthShort,
  formatMonthYear,
  formatNumericDate,
  formatDayMonth,
  formatDayMonthOrYear,
  formatFullDayMonth,
  formatWeekdayDate,
} from '../utils/format'
import { applyLocale } from '@/core/i18n'

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

  it('ne groupe pas les milliers', () => {
    expect(formatKg(1234.5)).toBe('1234,5')
  })
})

describe('formatKgAxis', () => {
  it('écrit une graduation ronde sans décimale inutile', () => {
    expect(formatKgAxis(24)).toBe('24')
    expect(formatKgAxis(24.5)).toBe('24,5')
    expect(formatKgAxis(4.2)).toBe('4,2')
  })

  it('arrondit à la décimale et ne groupe pas les milliers', () => {
    expect(formatKgAxis(23.500000001)).toBe('23,5')
    expect(formatKgAxis(1200)).toBe('1200')
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

  it('écrit un mois avec son année pour une validité', () => {
    expect(formatMonthYear('2026-12-12')).toBe('déc. 2026')
    expect(formatMonthYear('2027-09-14')).toBe('sept. 2027')
  })

  it('écrit une date complète courte', () => {
    expect(formatLongDate('2026-11-08')).toBe('8 nov. 2026')
  })

  it('écrit une date complète, mois en toutes lettres, pour le lecteur d’écran', () => {
    expect(formatFullDate('2026-02-03')).toBe('3 février 2026')
    expect(formatFullDate('2026-09-01')).toBe('1 septembre 2026')
  })

  it('écrit le jour et le mois abrégé, sans l’année', () => {
    expect(formatDayMonth('2026-09-28')).toBe('28 sept.')
    expect(formatDayMonth('2026-05-03')).toBe('3 mai')
  })

  it('n’ajoute l’année qu’en dehors de l’année en cours', () => {
    expect(formatDayMonthOrYear('2026-09-28', '2026-09-23')).toBe('28 sept.')
    expect(formatDayMonthOrYear('2025-08-10', '2026-09-23')).toBe('10 août 2025')
    expect(formatDayMonthOrYear('2027-01-05', '2026-09-23')).toBe('5 janv. 2027')
  })

  it('écrit le jour et le mois en toutes lettres pour le lecteur d’écran', () => {
    expect(formatFullDayMonth('2026-09-28')).toBe('28 septembre')
  })

  it('écrit une date précédée de son jour de la semaine abrégé', () => {
    expect(formatWeekdayDate('2026-09-20')).toBe('dim. 20 sept. 2026')
  })

  it('écrit une échéance en chiffres', () => {
    expect(formatNumericDate('2027-09-14T10:00:00Z')).toBe('14/09/2027')
    expect(formatNumericDate('2026-11-08')).toBe('08/11/2026')
  })
})

describe('en anglais', () => {
  afterEach(() => applyLocale('fr'))

  it('suit la langue courante pour les poids', () => {
    applyLocale('en')

    expect(formatKg(24.5)).toBe('24.5')
    expect(formatKg(24)).toBe('24.0')
    expect(formatKg(1234.5)).toBe('1234.5')
    expect(formatKgAxis(24.5)).toBe('24.5')
    expect(formatKgDelta(-0.3)).toBe('−0.3')
    expect(formatKgDelta(0)).toBe('±0.0')
  })

  it('suit la langue courante pour les mois et les dates', () => {
    applyLocale('en')

    expect(formatMonth('2026-08-14')).toBe('August')
    expect(formatMonthShort('2026-09-05')).toBe('Sep')
    expect(formatMonthYear('2026-12-12')).toBe('Dec 2026')
    expect(formatLongDate('2026-11-08')).toBe('Nov 8, 2026')
    expect(formatFullDate('2026-02-03')).toBe('February 3, 2026')
    expect(formatNumericDate('2027-09-14T10:00:00Z')).toBe('09/14/2027')
    expect(formatDayMonth('2026-09-28')).toBe('Sep 28')
    expect(formatFullDayMonth('2026-09-28')).toBe('September 28')
    expect(formatWeekdayDate('2026-09-20')).toBe('Sun, Sep 20, 2026')
  })
})
