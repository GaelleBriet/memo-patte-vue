import { describe, expect, it } from 'vitest'

import { doseGivenOn, nextDueAfterDose, rankedDueOn } from '../logic/treatment-dose'

const BRAVECTO = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: '11111111-1111-4111-8111-111111111111',
  periodId: '55555555-5555-4555-8555-555555555555',
  frequency: { value: 1, unit: 'month' },
  nextDueDate: '2026-09-28',
} as const

const A_L_HEURE = { givenOn: '2026-08-28', dueOn: '2026-08-28' }

function noted(givenOn: string, last = A_L_HEURE) {
  return doseGivenOn(BRAVECTO, givenOn, { id: 'p1', at: '2026-09-24T08:00:00.000Z', last })
}

describe('doseGivenOn', () => {
  it('vise l’échéance en cours dans la période en cours, et fixe la prochaine dose depuis la date réelle', () => {
    expect(noted('2026-09-20')).toEqual({
      id: 'p1',
      periodId: BRAVECTO.periodId,
      treatmentId: BRAVECTO.id,
      animalId: BRAVECTO.animalId,
      dueOn: '2026-09-28',
      dueTime: null,
      givenOn: '2026-09-20',
      status: 'given',
      nextDueDate: '2026-10-20',
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      deletedAt: null,
    })
  })

  it('donnée en retard, vise toujours l’échéance en cours', () => {
    expect(noted('2026-10-02')).toMatchObject({
      dueOn: '2026-09-28',
      givenOn: '2026-10-02',
      nextDueDate: '2026-11-02',
    })
  })

  it('première prise d’un traitement sans aucune ligne, vise l’échéance en cours', () => {
    expect(doseGivenOn(BRAVECTO, '2026-09-20', { id: 'p1', at: '', last: null }).dueOn).toBe(
      '2026-09-28',
    )
  })

  it('notée pour un jour d’avant la dernière prise, vise ce jour et pas l’échéance en cours', () => {
    expect(noted('2026-08-01')).toMatchObject({
      dueOn: '2026-08-01',
      givenOn: '2026-08-01',
      nextDueDate: '2026-09-01',
    })
  })

  it('plus récente que la dernière, passe toujours après son échéance, même avancée à la main', () => {
    const enAvance = { givenOn: '2026-08-28', dueOn: '2026-10-05' }

    expect(noted('2026-09-20', enAvance)).toMatchObject({
      dueOn: '2026-10-06',
      givenOn: '2026-09-20',
    })
  })

  it('plus ancienne qu’une dernière prise donnée en retard, reste avant son échéance', () => {
    const enRetard = { givenOn: '2026-08-28', dueOn: '2026-08-20' }

    expect(noted('2026-08-25', enRetard)).toMatchObject({
      dueOn: '2026-08-19',
      givenOn: '2026-08-25',
      nextDueDate: '2026-09-25',
    })
  })
})

describe('rankedDueOn', () => {
  const derniere = { givenOn: '2026-10-05', dueOn: '2026-09-28' }

  it('garde l’échéance voulue quand elle respecte le rang de la date', () => {
    expect(rankedDueOn('2026-10-07', '2026-10-07', derniere)).toBe('2026-10-07')
    expect(rankedDueOn('2026-09-01', '2026-09-01', derniere)).toBe('2026-09-01')
    expect(rankedDueOn('2026-09-01', '2026-09-01', null)).toBe('2026-09-01')
  })

  it('place après l’échéance de la dernière une prise datée après elle', () => {
    expect(rankedDueOn('2026-09-20', '2026-10-06', derniere)).toBe('2026-09-29')
    expect(rankedDueOn('2026-09-28', '2026-10-06', derniere)).toBe('2026-09-29')
  })

  it('place avant l’échéance de la dernière une prise datée avant elle', () => {
    expect(rankedDueOn('2026-10-02', '2026-10-02', derniere)).toBe('2026-09-27')
    expect(rankedDueOn('2026-09-28', '2026-10-02', derniere)).toBe('2026-09-27')
  })

  it('compare à l’échéance d’une dernière ligne sans date réelle', () => {
    const oubliee = { givenOn: null, dueOn: '2026-09-28' }

    expect(rankedDueOn('2026-09-20', '2026-09-30', oubliee)).toBe('2026-09-29')
  })
})

describe('nextDueAfterDose', () => {
  const derniereLe28 = { ...BRAVECTO, lastDoseDate: '2026-08-28' }

  it('recalcule la prochaine dose d’une prise plus récente que la dernière', () => {
    expect(nextDueAfterDose(derniereLe28, '2026-09-23')).toBe('2026-10-23')
  })

  it('garde la prochaine dose quand la prise est plus ancienne ou du même jour que la dernière', () => {
    expect(nextDueAfterDose(derniereLe28, '2026-08-01')).toBe('2026-09-28')
    expect(nextDueAfterDose(derniereLe28, '2026-08-28')).toBe('2026-09-28')
  })
})
