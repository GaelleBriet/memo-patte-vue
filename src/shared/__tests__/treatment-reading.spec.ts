import { describe, expect, it } from 'vitest'

import { treatmentView, viewInputOf, type LegacyInput } from '../domain/dose-calendar'
import { currentPeriodIn, shownLines, treatmentReading } from '../domain/treatment-reading'

type Period = LegacyInput['periods'][number]
type Dose = LegacyInput['doses'][number]

const period = (extra: Partial<Period> = {}): Period => ({
  id: 'p-1',
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  referenceOn: '2026-10-01',
  endsOn: null,
  stoppedOn: null,
  frequency: { value: 1, unit: 'day' },
  times: [],
  createdAt: '2026-10-01T08:00:00.000Z',
  ...extra,
})

const dose = (extra: Partial<Dose> = {}): Dose => ({
  id: 'd-1',
  periodId: 'p-1',
  dueOn: '2026-10-01',
  dueTime: null,
  status: 'given',
  givenOn: '2026-10-01',
  nextDueDate: '2026-10-02',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...extra,
})

const TODAY = '2026-10-03'

describe('treatmentReading', () => {
  it('lit un traitement enregistré par le moteur v2, comme sa lecture directe', () => {
    const treatment = { periods: [period()], doses: [dose()] }
    const read = treatmentReading(treatment, TODAY)
    const direct = treatmentView(viewInputOf({ ...treatment, today: TODAY }))
    expect(read?.phase).toBe('today')
    expect(read?.unloggedDoses).toHaveLength(1)
    expect(read?.currentDoses).toEqual(direct.currentDoses)
    expect(read?.unloggedDoses).toEqual(direct.unloggedDoses)
  })

  it.each([
    ['un jour de période invalide', { periods: [period({ firstDueOn: '2026-02-30' })], doses: [] }],
    ['une heure invalide', { periods: [period({ times: ['25:00'] })], doses: [] }],
    ['deux fois la même heure', { periods: [period({ times: ['08:00', '08:00'] })], doses: [] }],
    [
      'une fréquence invalide',
      { periods: [period({ frequency: { value: 0, unit: 'day' } })], doses: [] },
    ],
    [
      'un état de prise inconnu',
      { periods: [period()], doses: [dose({ status: 'lost' as 'given' })] },
    ],
    ['une échéance de prise invalide', { periods: [period()], doses: [dose({ dueOn: 'demain' })] }],
    [
      'une arrivée de report invalide',
      {
        periods: [period()],
        doses: [dose({ status: 'postponed', givenOn: null, nextDueDate: '' })],
      },
    ],
  ])('rend null pour %s', (_, treatment) => {
    expect(treatmentReading(treatment, TODAY)).toBeNull()
  })

  it('lit une prise dont la prochaine échéance enregistrée est invalide : rien ne la relit', () => {
    const treatment = { periods: [period()], doses: [dose({ nextDueDate: 'jamais' })] }
    expect(treatmentReading(treatment, TODAY)).not.toBeNull()
  })

  it('rend null pour un calendrier démesuré, sans le calculer', () => {
    const times = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const old = period({
      startsOn: '1900-01-01',
      firstDueOn: '1900-01-01',
      referenceOn: '1900-01-01',
      times,
    })
    expect(treatmentReading({ periods: [old], doses: [] }, TODAY)).toBeNull()
  })
})

describe('shownLines', () => {
  it('cache un report revenu à sa date et la plus ancienne de deux prises d’une même échéance', () => {
    const treatment = {
      periods: [period()],
      doses: [
        dose({ id: 'old', updatedAt: '2026-10-01T08:00:00.000Z' }),
        dose({ id: 'new', updatedAt: '2026-10-01T10:00:00.000Z' }),
        dose({
          id: 'back',
          dueOn: '2026-10-02',
          status: 'postponed',
          givenOn: null,
          nextDueDate: '2026-10-02',
        }),
      ],
    }
    expect(shownLines(treatmentReading(treatment, TODAY)!).map(({ id }) => id)).toEqual(['new'])
  })

  it('garde une prise qui ne couvre plus rien, à sa place', () => {
    const treatment = {
      periods: [period({ frequency: { value: 1, unit: 'week' } })],
      doses: [dose({ id: 'a' }), dose({ id: 'off', dueOn: '2026-09-20', givenOn: '2026-09-20' })],
    }
    const read = treatmentReading(treatment, TODAY)!
    expect(read.history.find(({ line }) => line.id === 'off')?.effect.kind).toBe('idle')
    expect(shownLines(read).map(({ id }) => id)).toEqual(['off', 'a'])
  })
})

describe('currentPeriodIn', () => {
  it('rend l’enregistrement du réglage en cours, la reprise après un arrêt', () => {
    const first = period({ stoppedOn: '2026-10-02' })
    const resumed = period({ id: 'p-2', startsOn: '2026-10-03', firstDueOn: '2026-10-03' })
    const periods = [resumed, first]
    expect(currentPeriodIn(periods, treatmentReading({ periods, doses: [] }, TODAY)!)).toBe(resumed)
    expect(currentPeriodIn([], treatmentReading({ periods: [], doses: [] }, TODAY)!)).toBeNull()
  })
})
