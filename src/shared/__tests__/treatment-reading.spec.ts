import { describe, expect, it } from 'vitest'

import { legacyFactsOf, treatmentView } from '../domain/dose-calendar'
import {
  countedLines,
  historyEntries,
  readCarnet,
  readTreatment,
  treatmentReading,
  type TreatmentRecords,
} from '../domain/treatment-reading'

type Period = TreatmentRecords['periods'][number]
type Dose = TreatmentRecords['doses'][number]

const inputOf = ({ periods, doses }: TreatmentRecords, today: string) => ({
  settings: periods,
  lines: doses.map(({ periodId, ...line }) => ({ ...line, settingId: periodId })),
  today,
})

const period = (extra: Partial<Period> = {}): Period => ({
  id: 'p-1',
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  ...legacyFactsOf(extra.gridOriginOn === undefined ? '2026-10-01' : extra.gridOriginOn),
  gridOriginOn: '2026-10-01',
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
  targetOn: null,
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...extra,
})

const TODAY = '2026-10-03'

const UNREADABLE: [string, TreatmentRecords][] = [
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
      doses: [dose({ status: 'postponed', givenOn: null, targetOn: '' })],
    },
  ],
  [
    'un report sans arrivée',
    { periods: [period()], doses: [dose({ status: 'postponed', givenOn: null })] },
  ],
  [
    'un jour d’arrivée invalide sur une prise',
    { periods: [period()], doses: [dose({ targetOn: 'jamais' })] },
  ],
]

describe('treatmentReading', () => {
  it('lit un traitement enregistré par le moteur v2, comme sa lecture directe', () => {
    const treatment = { periods: [period()], doses: [dose()] }
    const read = treatmentReading(treatment, TODAY)
    const direct = treatmentView(inputOf(treatment, TODAY))
    expect(read?.phase).toBe('today')
    expect(read?.unloggedDoses).toHaveLength(1)
    expect(read?.currentDoses).toEqual(direct.currentDoses)
    expect(read?.unloggedDoses).toEqual(direct.unloggedDoses)
  })

  it.each(UNREADABLE)('rend null pour %s', (_, treatment) => {
    expect(treatmentReading(treatment, TODAY)).toBeNull()
  })

  it('rend null pour un calendrier démesuré, sans le calculer', () => {
    const times = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const old = period({
      startsOn: '1900-01-01',
      firstDueOn: '1900-01-01',
      gridOriginOn: '1900-01-01',
      times,
    })
    expect(treatmentReading({ periods: [old], doses: [] }, TODAY)).toBeNull()
  })

  it('lit un traitement de tous les jours à 8 h et 20 h qui finit en 2100', () => {
    const milbemax = period({
      startsOn: '2026-10-12',
      firstDueOn: '2026-10-12',
      gridOriginOn: '2026-10-12',
      endsOn: '2100-01-01',
      times: ['08:00', '20:00'],
    })
    expect(treatmentReading({ periods: [milbemax], doses: [] }, '2026-10-12')).not.toBeNull()
  })
})

describe('#873 : le jour de la réponse « Elles n’étaient pas à donner » est le jour local de la réécriture du calendrier', () => {
  const writtenOn = (settingsWrittenAt: string | undefined) =>
    readTreatment({ periods: [period({ settingsWrittenAt })], doses: [] }, TODAY)!.input
      .settings[0]!.writtenOn

  it('à 0 h 30, heure du téléphone, le 2 : le 2', () => {
    expect(writtenOn(new Date(2026, 9, 2, 0, 30).toISOString())).toBe('2026-10-02')
  })

  it('une date plus loin qu’aujourd’hui (horloge d’un autre appareil) vaut aujourd’hui', () => {
    expect(writtenOn(new Date(2026, 11, 1, 12, 0).toISOString())).toBe(TODAY)
  })

  it('sans date d’écriture : inconnu', () => {
    expect(writtenOn(undefined)).toBeUndefined()
  })

  it('une réponse hors des trois états rend le traitement illisible', () => {
    const forged = period({ fallenDosesAnswer: 'oui' as never })
    expect(readTreatment({ periods: [forged], doses: [] }, TODAY)).toBeNull()
  })
})

describe('countedLines', () => {
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
          targetOn: '2026-10-02',
        }),
      ],
    }
    expect(countedLines(treatmentReading(treatment, TODAY)!).map(({ id }) => id)).toEqual(['new'])
  })

  it('garde une prise hors du calendrier, à sa place, sur sa propre journée (règle du 17 octobre 2026)', () => {
    const treatment = {
      periods: [period({ frequency: { value: 1, unit: 'week' } })],
      doses: [dose({ id: 'a' }), dose({ id: 'off', dueOn: '2026-09-20', givenOn: '2026-09-20' })],
    }
    const read = treatmentReading(treatment, TODAY)!
    expect(read.history.find(({ line }) => line.id === 'off')?.effect).toEqual({
      kind: 'covers',
      key: '2026-09-20',
    })
    expect(countedLines(read).map(({ id }) => id)).toEqual(['off', 'a'])
  })

  it('garde un report écrit sous les heures d’avant, la fréquence ayant changé le même jour : il emporte 20 h (décision du 15 octobre 2026)', () => {
    const treatment = {
      periods: [
        period({
          startsOn: '2026-03-28',
          firstDueOn: '2026-03-28',
          gridOriginOn: '2026-03-28',
          frequency: { value: 2, unit: 'day' },
          times: ['08:00', '20:00'],
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        period({
          id: 'p-2',
          startsOn: '2026-03-28',
          firstDueOn: '2026-03-28',
          gridOriginOn: '2026-03-28',
          frequency: { value: 3, unit: 'month' },
          createdAt: '2026-01-01T00:00:30.000Z',
        }),
      ],
      doses: [
        dose({
          id: 'report',
          dueOn: '2026-03-28',
          dueTime: '20:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-03-29',
        }),
        dose({
          id: 'prise',
          dueOn: '2026-03-29',
          dueTime: '20:00',
          givenOn: '2026-03-25',
        }),
      ],
    }
    const read = treatmentReading(treatment, '2026-03-28')!
    expect(read.history.find(({ line }) => line.id === 'report')?.effect).toEqual({
      kind: 'moves',
      keys: ['2026-03-28 20:00'],
      arrival: '2026-03-29',
    })
    expect(countedLines(read).map(({ id }) => id)).toEqual(['report', 'prise'])
  })
})

describe('historyEntries (R11, R12, décision du 2026-10-12)', () => {
  it('rend toutes les lignes, celles sans effet marquées, comme l’historique de la fiche', () => {
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
          targetOn: '2026-10-02',
        }),
      ],
    }
    expect(
      historyEntries(treatmentReading(treatment, TODAY)!).map(({ line, idle }) => [line.id, idle]),
    ).toEqual([
      ['old', true],
      ['new', false],
      ['back', true],
    ])
  })
})

describe('readTreatment', () => {
  it('rend la vue et le carnet que lisent les gestes', () => {
    const treatment = { periods: [period()], doses: [dose()] }
    const reading = readTreatment(treatment, TODAY)
    expect(reading?.input).toEqual(inputOf(treatment, TODAY))
    expect(reading?.view.currentDoses).toEqual(treatmentReading(treatment, TODAY)?.currentDoses)
  })

  it('rend null pour un traitement illisible', () => {
    const treatment = { periods: [period({ firstDueOn: '2026-02-30' })], doses: [] }
    expect(readTreatment(treatment, TODAY)).toBeNull()
  })

  it('date chaque réglage de l’écriture de son calendrier, jamais de sa dernière modification (R10, #867)', () => {
    const written = {
      ...period({ settingsWrittenAt: '2026-10-02T20:00:00.000Z' }),
      updatedAt: '2026-10-03T07:00:00.000Z',
    }

    const reading = readTreatment({ periods: [written], doses: [dose()] }, TODAY)

    expect(reading?.input.settings).toEqual([
      expect.objectContaining({ id: 'p-1', updatedAt: '2026-10-02T20:00:00.000Z' }),
    ])
  })
})

describe('readCarnet', () => {
  it('lit le carnet du moteur comme readTreatment lit les données enregistrées', () => {
    const treatment = { periods: [period()], doses: [dose()] }
    const reading = readTreatment(treatment, TODAY)!
    const carnet = readCarnet(reading.input)
    expect(carnet?.input).toBe(reading.input)
    expect(carnet?.view.currentDoses).toEqual(reading.view.currentDoses)
    expect(carnet?.view.unloggedDoses).toEqual(reading.view.unloggedDoses)
  })

  it.each(UNREADABLE)('rend null pour un carnet avec %s', (_, treatment) => {
    expect(readCarnet(inputOf(treatment, TODAY))).toBeNull()
  })

  it('rend null pour un carnet démesuré, sans le calculer', () => {
    const times = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const old = period({ startsOn: '1900-01-01', firstDueOn: '1900-01-01', times })
    expect(readCarnet(inputOf({ periods: [old], doses: [] }, TODAY))).toBeNull()
  })
})
