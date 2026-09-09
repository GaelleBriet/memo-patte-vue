import { describe, expect, it } from 'vitest'
import { vaccinationStatus } from '../vaccination-status'

const TODAY = '2026-09-09'

describe('vaccinationStatus', () => {
  it('est en retard la veille de today et avant', () => {
    expect(vaccinationStatus('2026-09-08', TODAY)).toBe('overdue')
    expect(vaccinationStatus('2024-01-01', TODAY)).toBe('overdue')
  })

  it('est à jour le jour même et après', () => {
    expect(vaccinationStatus(TODAY, TODAY)).toBe('up-to-date')
    expect(vaccinationStatus('2026-09-10', TODAY)).toBe('up-to-date')
    expect(vaccinationStatus('2026-12-01', TODAY)).toBe('up-to-date')
  })

  it('n’a pas de rappel sans échéance : ni à jour, ni en retard', () => {
    expect(vaccinationStatus(null, TODAY)).toBe('none')
  })
})
