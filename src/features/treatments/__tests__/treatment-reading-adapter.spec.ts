import { describe, expect, it } from 'vitest'

import {
  currentPeriodOf,
  readableReadingOf,
  treatmentReadingOf,
} from '../logic/treatment-reading-adapter'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { legacyFactsOf } from '@/shared/domain/dose-calendar'

const AT = '2026-09-01T08:00:00.000Z'

function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  const record = {
    id: 'p-1',
    treatmentId: 'metacam',
    animalId: 'luna',
    startsOn: '2026-09-01',
    firstDueOn: '2026-09-01',
    gridOriginOn: '2026-09-01',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'day' },
    times: ['20:00'],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  } satisfies Partial<TreatmentPeriodRecord>
  return {
    ...legacyFactsOf(record.gridOriginOn),
    settingsWrittenAt: record.createdAt,
    ...record,
  }
}

function metacam(periods: TreatmentPeriodRecord[]): TreatmentWithPeriods {
  return {
    id: 'metacam',
    animalId: 'luna',
    name: 'Métacam',
    type: 'medication',
    createdAt: AT,
    updatedAt: AT,
    periods,
    doses: [],
  }
}

describe('treatmentReadingOf', () => {
  it('lit le calendrier pour le jour donné, sans lire l’horloge', () => {
    const treatment = metacam([period({ firstDueOn: '2026-09-10' })])

    expect(treatmentReadingOf(treatment, '2026-09-05').view).toMatchObject({
      phase: 'upcoming',
      currentDoses: [{ settingId: 'p-1', dueOn: '2026-09-10', dueTime: '20:00' }],
    })
    expect(treatmentReadingOf(treatment, '2026-09-10').view.phase).toBe('today')
    expect(treatmentReadingOf(treatment, '2026-09-12').view.unloggedDoses).toEqual([
      { settingId: 'p-1', dueOn: '2026-09-10', dueTime: '20:00' },
      { settingId: 'p-1', dueOn: '2026-09-11', dueTime: '20:00' },
    ])
  })

  it('lit les prises telles que la base les rend', () => {
    const treatment: TreatmentWithPeriods = {
      ...metacam([period()]),
      doses: [
        {
          id: 'd-1',
          periodId: 'p-1',
          treatmentId: 'metacam',
          animalId: 'luna',
          dueOn: '2026-09-01',
          dueTime: '20:00',
          givenOn: '2026-09-01',
          status: 'given',
          targetOn: null,
          previousTargetOn: null,
          previousTargetTime: null,
          dueRank: null,
          createdAt: AT,
          updatedAt: AT,
          deletedAt: null,
        },
      ],
    }

    const { view, input } = treatmentReadingOf(treatment, '2026-09-02')

    expect(view.history.map(({ line }) => line.id)).toEqual(['d-1'])
    expect(input.lines).toMatchObject([{ id: 'd-1', settingId: 'p-1', targetOn: null }])
  })

  it('lève une RangeError quand une donnée est illisible', () => {
    const treatment = metacam([period({ times: ['8h'] })])

    expect(() => treatmentReadingOf(treatment, '2026-09-05')).toThrow(RangeError)
  })
})

describe('currentPeriodOf', () => {
  it('rend la période en cours du moteur, celle dont le formulaire lit les réglages', () => {
    const reprise = period({ id: 'p-2', startsOn: '2026-09-20', times: ['08:00', '20:00'] })
    const treatment = metacam([period({ stoppedOn: '2026-09-20' }), reprise])

    expect(currentPeriodOf(treatment, treatmentReadingOf(treatment, '2026-09-21').view)).toBe(
      reprise,
    )
  })

  it('départage deux périodes du même jour par leur saisie, quel que soit leur ordre de lecture', () => {
    const premiere = period({ id: 'p-b' })
    const seconde = period({ id: 'p-a', createdAt: '2026-09-01T09:00:00.000Z' })
    const treatment = metacam([seconde, premiere])

    expect(currentPeriodOf(treatment, treatmentReadingOf(treatment, '2026-09-21').view)).toBe(
      seconde,
    )
  })

  it('ne rend rien sans période', () => {
    expect(currentPeriodOf(metacam([]), { currentSetting: null })).toBeNull()
  })
})

describe('readableReadingOf', () => {
  it('rend la lecture d’un traitement lisible, rien pour un traitement illisible ou absent', () => {
    expect(readableReadingOf(metacam([period()]), '2026-09-05')?.view.phase).toBe('today')
    expect(readableReadingOf(metacam([period({ times: ['8h'] })]), '2026-09-05')).toBeNull()
    expect(readableReadingOf(null, '2026-09-05')).toBeNull()
  })
})
