import { describe, expect, it } from 'vitest'

import {
  canAddTime,
  isTimeTaken,
  withTime,
  withTimeChanged,
  withoutTime,
} from '../logic/treatment-times-input'
import { MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'

describe('heures du traitement (TR-5)', () => {
  it('ajoute une heure dans l’ordre de la journée', () => {
    expect(withTime(['20:00'], '08:00')).toEqual(['08:00', '20:00'])
  })

  it('ignore une heure déjà présente ou illisible', () => {
    expect(withTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(withTime(['08:00'], '')).toEqual(['08:00'])
  })

  it('retire une heure et en change une autre', () => {
    expect(withoutTime(['08:00', '20:00'], '08:00')).toEqual(['20:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '07:30')).toEqual(['07:30', '08:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '08:00')).toEqual(['08:00', '20:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '20:00')).toEqual(['08:00', '20:00'])
    expect(withTimeChanged(['08:00'], '08:00', '')).toEqual(['08:00'])
  })

  it('reconnaît une heure déjà prise par une autre puce', () => {
    expect(isTimeTaken(['08:00', '20:00'], '20:00')).toBe(true)
    expect(isTimeTaken(['08:00', '20:00'], '20:00', '20:00')).toBe(false)
    expect(isTimeTaken(['08:00', '20:00'], '09:00')).toBe(false)
  })

  it('s’arrête à 24 heures par jour', () => {
    const toutes = Array.from(
      { length: MAX_TIMES_PER_DAY },
      (_, hour) => `${String(hour).padStart(2, '0')}:00`,
    )

    expect(canAddTime(toutes.slice(1))).toBe(true)
    expect(canAddTime(toutes)).toBe(false)
    expect(withTime(toutes, '00:30')).toEqual(toutes)
  })
})
