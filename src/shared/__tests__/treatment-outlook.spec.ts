import { describe, expect, it } from 'vitest'

import type { ExportTreatmentDose, ExportTreatmentPeriod } from '../domain/carnet-data'
import {
  outlookDueDate,
  treatmentOutlooks,
  treatmentStates,
  type TreatmentOutlook,
} from '../domain/treatment-outlook'

const STAMPS = {
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  createdByDevice: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  updatedByDevice: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
}

function period(changes: Partial<ExportTreatmentPeriod> = {}): ExportTreatmentPeriod {
  return {
    id: 'p-1',
    treatmentId: 't-1',
    animalId: 'a-1',
    startsOn: '2026-09-01',
    firstDueOn: '2026-09-01',
    referenceOn: '2026-09-01',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'month' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    ...STAMPS,
    ...changes,
  }
}

function given(dueOn: string, changes: Partial<ExportTreatmentDose> = {}): ExportTreatmentDose {
  return {
    id: `d-${dueOn}`,
    periodId: 'p-1',
    treatmentId: 't-1',
    animalId: 'a-1',
    dueOn,
    dueTime: null,
    givenOn: dueOn,
    status: 'given',
    nextDueDate: dueOn,
    ...STAMPS,
    ...changes,
  }
}

function outlook(
  periods: ExportTreatmentPeriod[],
  doses: ExportTreatmentDose[],
  today: string,
): TreatmentOutlook {
  return treatmentOutlooks({ treatmentPeriods: periods, treatmentDoses: doses }, today)('t-1')
}

describe('treatmentOutlooks', () => {
  it('donne la prochaine échéance d’un traitement à jour', () => {
    expect(outlook([period()], [given('2026-09-01')], '2026-09-15')).toEqual({
      kind: 'due',
      dueOn: '2026-10-01',
      dueTime: null,
      overdue: false,
    })
  })

  it('signale une échéance dépassée', () => {
    expect(outlook([period()], [given('2026-09-01')], '2026-10-05')).toEqual({
      kind: 'due',
      dueOn: '2026-10-01',
      dueTime: null,
      overdue: true,
    })
  })

  it('ne donne l’heure que pour une période à plusieurs heures', () => {
    const oneTime = period({ frequency: { value: 1, unit: 'day' }, times: ['08:00'] })
    const twoTimes = period({ frequency: { value: 1, unit: 'day' }, times: ['08:00', '20:00'] })

    expect(outlook([oneTime], [], '2026-09-01')).toMatchObject({ kind: 'due', dueTime: null })
    expect(outlook([twoTimes], [], '2026-09-01')).toMatchObject({
      kind: 'due',
      dueTime: '08:00',
    })
  })

  it('dit un traitement arrêté, et s’il l’a été avant la première dose', () => {
    expect(
      outlook([period({ stoppedOn: '2026-09-10' })], [given('2026-09-01')], '2026-09-15'),
    ).toEqual({ kind: 'stopped', on: '2026-09-10', beforeFirstDose: false })
    expect(
      outlook(
        [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', stoppedOn: '2026-09-10' })],
        [],
        '2026-09-15',
      ),
    ).toEqual({ kind: 'stopped', on: '2026-09-10', beforeFirstDose: true })
  })

  it('dit un traitement terminé par sa date de fin', () => {
    expect(
      outlook([period({ endsOn: '2026-09-01' })], [given('2026-09-01')], '2026-09-15'),
    ).toMatchObject({ kind: 'ended' })
  })

  it('dit illisible un traitement que le moteur ne sait pas lire', () => {
    expect(outlook([period({ times: ['25:00'] })], [], '2026-09-15')).toEqual({
      kind: 'unreadable',
    })
  })
})

describe('treatmentStates', () => {
  it('ne relit chaque traitement qu’une fois, avec ses seules périodes et prises', () => {
    const other = period({ id: 'p-2', treatmentId: 't-2' })
    const states = treatmentStates(
      { treatmentPeriods: [period(), other], treatmentDoses: [given('2026-09-01')] },
      '2026-09-15',
    )

    const state = states('t-1')

    expect(states('t-1')).toBe(state)
    expect(state.periods.map(({ id }) => id)).toEqual(['p-1'])
    expect(state.doses).toHaveLength(1)
    expect(state.schedule).not.toBeNull()
  })
})

describe('outlookDueDate', () => {
  it('ne donne une date qu’à une échéance', () => {
    expect(
      outlookDueDate({ kind: 'due', dueOn: '2026-10-01', dueTime: null, overdue: false }),
    ).toBe('2026-10-01')
    expect(outlookDueDate({ kind: 'ended', on: '2026-09-01' })).toBeNull()
    expect(outlookDueDate({ kind: 'unreadable' })).toBeNull()
  })
})
