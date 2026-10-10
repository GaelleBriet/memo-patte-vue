// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { gridDays, hoursOf, isOnGrid, plusDays, stepped } from '../domain/dose-calendar/grid'

const MONTH = { value: 1, unit: 'month' } as const
const WEEK = { value: 1, unit: 'week' } as const

describe('R2 : la grille', () => {
  it('un mensuel du 31 janv. tombe le dernier jour des mois courts sans que l’origine change', () => {
    expect(gridDays('2026-01-31', MONTH, '2026-01-31', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('compte les pas depuis l’origine, en arrière comme en avant', () => {
    expect(stepped('2026-03-31', MONTH, -1)).toBe('2026-02-28')
    expect(stepped('2026-10-02', WEEK, 3)).toBe('2026-10-23')
    expect(gridDays('2026-10-23', WEEK, '2026-10-01', '2026-10-17')).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
    ])
  })

  it('un jour est sur la grille quand un nombre entier de pas y mène', () => {
    expect(isOnGrid('2026-01-31', MONTH, '2026-02-28')).toBe(true)
    expect(isOnGrid('2026-02-28', MONTH, '2026-03-31')).toBe(false)
    expect(plusDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('chaque journée a les heures du réglage, triées, ou une seule échéance sans heure', () => {
    expect(hoursOf(['20:00', '08:00'])).toEqual(['08:00', '20:00'])
    expect(hoursOf([])).toEqual([null])
  })
})
