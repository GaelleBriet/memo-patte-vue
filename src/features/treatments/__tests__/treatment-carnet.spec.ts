import { afterEach, describe, expect, it, vi } from 'vitest'

import { dose, extra, missed, period, plain, treatment } from './treatment-fixtures'
import { carnetScheduleCache, carnetTreatments } from '../logic/treatment-carnet'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import i18n, { applyLocale } from '@/core/i18n'
import * as engine from '@/shared/domain/treatment-schedule'

const t = i18n.global.t
const TODAY = '2026-09-28'

function named(
  name: string,
  periods: TreatmentPeriodRecord[],
  doses: NewTreatmentDose[] = [],
  type: TreatmentWithHistory['type'] = 'deworming',
): TreatmentWithHistory {
  return { ...treatment(periods, doses), id: name.toLowerCase(), name, type }
}

function carnet(treatments: TreatmentWithHistory[], today = TODAY) {
  return plain(carnetTreatments(t, treatments, today))
}

function row(book: TreatmentWithHistory, today = TODAY) {
  const [only] = carnet([book], today).ongoing
  if (!only) throw new Error('Pas de ligne en cours')
  return only
}

const TRIMESTRIEL = period({
  frequency: { value: 3, unit: 'month' },
  startsOn: '2026-07-10',
  firstDueOn: '2026-07-10',
})
const MILBEMAX = named('Milbemax', [TRIMESTRIEL], [dose('2026-07-10', '2026-10-10')])
const HEBDO = period({
  frequency: { value: 1, unit: 'week' },
  startsOn: '2026-09-07',
  firstDueOn: '2026-09-07',
})
/** Dernière prise le 2 sept. : 25 doses non renseignées, dose du jour le 28. */
const PANACUR = named(
  'Panacur',
  [period()],
  [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
)
const A_JOUR = Array.from({ length: 27 }, (_, index) => {
  const day = `2026-09-${String(index + 1).padStart(2, '0')}`
  return dose(day, day)
})

afterEach(() => {
  applyLocale('fr')
  vi.restoreAllMocks()
})

describe('carnetTreatments — une ligne par traitement en cours (TR-36)', () => {
  it('à venir : la prochaine dose, en gris, et le badge de fréquence', () => {
    expect(row(MILBEMAX)).toEqual({
      id: 'milbemax',
      name: 'Milbemax',
      type: 'Vermifuge',
      badge: 'Tous les 3 mois',
      detail: 'Prochaine dose · 10 oct.',
      tone: 'later',
      unlogged: null,
    })
  })

  it('du jour : « Dose du jour », avec son heure', () => {
    const soirs = A_JOUR.map(({ dueOn }) => dose(dueOn, dueOn, { dueTime: '20:00' }))
    const metacam = named('Métacam', [period({ times: ['20:00'] })], soirs, 'medication')

    expect(row(metacam)).toMatchObject({
      type: 'Médicament',
      detail: 'Dose du jour · 28 sept. à 20 h',
      tone: 'today',
      badge: 'Tous les jours',
    })
  })

  it('à plusieurs heures : une seule ligne, sans heure tant qu’il en reste plusieurs', () => {
    const matinEtSoir = period({ times: ['08:00', '20:00'] })
    const hier = A_JOUR.flatMap(({ dueOn }) => [
      dose(dueOn, dueOn, { dueTime: '08:00' }),
      dose(dueOn, dueOn, { dueTime: '20:00' }),
    ])
    const matin = dose(TODAY, TODAY, { dueTime: '08:00' })

    expect(row(named('Métacam', [matinEtSoir], hier)).detail).toBe('Dose du jour · 28 sept.')
    expect(row(named('Métacam', [matinEtSoir], [...hier, matin])).detail).toBe(
      'Dose du jour · 28 sept. à 20 h',
    )
    expect(carnet([named('Métacam', [matinEtSoir], hier)]).ongoing).toHaveLength(1)
  })

  it('en retard : le dit en corail, depuis le jour de la dose', () => {
    const advocate = named('Advocate', [HEBDO], [dose('2026-09-07', '2026-09-14')])

    expect(row(advocate, '2026-09-16')).toMatchObject({
      detail: 'En retard depuis le 14 sept.',
      tone: 'overdue',
      unlogged: null,
    })
  })

  it('des doses non renseignées s’ajoutent sous la ligne, jamais comme un retard (TR-14)', () => {
    expect(row(PANACUR)).toMatchObject({
      detail: 'Dose du jour · 28 sept.',
      tone: 'today',
      badge: 'Tous les jours',
      unlogged: '25 doses non renseignées',
    })
    expect(carnet([PANACUR]).summary).toEqual({ total: 1, overdue: 0, ongoing: 1 })
  })

  it('fini ou arrêté avec des doses à renseigner : reste en cours, badge « À renseigner »', () => {
    const arrete = named('Panacur', [period({ stoppedOn: '2026-09-06' })], PANACUR.doses)
    const fini = named('Drontal', [period({ endsOn: '2026-09-04' })], PANACUR.doses)
    const { ongoing, finished, summary } = carnet([arrete, fini])

    expect(ongoing).toMatchObject([
      { name: 'Panacur', badge: 'À renseigner', detail: 'Arrêté le 6 sept.', tone: 'later' },
      { name: 'Drontal', badge: 'À renseigner', detail: 'Terminé le 4 sept.', tone: 'later' },
    ])
    expect(ongoing.map(({ unlogged }) => unlogged)).toEqual([
      '3 doses non renseignées',
      '2 doses non renseignées',
    ])
    expect(finished).toEqual([])
    expect(summary).toEqual({ total: 0, overdue: 0, ongoing: 2 })
  })

  it('illisible : une ligne sobre, sans badge, qui ne fait pas tomber les autres', () => {
    const illisible = named('Abîmé', [period({ times: ['8h'] })])
    const { ongoing, summary } = carnet([illisible, MILBEMAX])

    expect(ongoing).toMatchObject([
      { name: 'Milbemax' },
      { id: 'abîmé', badge: null, detail: 'Donnée illisible', tone: 'later', unlogged: null },
    ])
    expect(summary).toEqual({ total: 1, overdue: 0, ongoing: 2 })
  })

  it('range le plus urgent d’abord, les traitements à renseigner ensuite', () => {
    const enRetard = named('Advocate', [HEBDO], [dose('2026-09-07', '2026-09-14')])
    const arrete = named('Drontal', [period({ stoppedOn: '2026-09-06' })], PANACUR.doses)
    const { ongoing, summary } = carnet([arrete, MILBEMAX, PANACUR, enRetard], '2026-09-30')

    expect(ongoing.map(({ name }) => name)).toEqual(['Advocate', 'Panacur', 'Milbemax', 'Drontal'])
    expect(summary).toEqual({ total: 3, overdue: 1, ongoing: 4 })
  })

  it('ne calcule le calendrier qu’une fois par traitement', () => {
    const schedule = vi.spyOn(engine, 'treatmentSchedule')

    carnet([MILBEMAX, PANACUR])

    expect(schedule).toHaveBeenCalledTimes(2)
  })

  it('après un geste, ne recalcule que le traitement touché', () => {
    const cache = carnetScheduleCache()
    carnetTreatments(t, [MILBEMAX, PANACUR], TODAY, cache)
    const schedule = vi.spyOn(engine, 'treatmentSchedule')
    const noted = dose('2026-09-03', '2026-09-04', { updatedAt: '2026-09-28T10:00:00.000Z' })
    const touched = { ...PANACUR, doses: [...PANACUR.doses, noted] }

    const after = carnetTreatments(t, [MILBEMAX, touched], TODAY, cache)

    expect(schedule).toHaveBeenCalledOnce()
    expect(after.ongoing.find(({ name }) => name === 'Panacur')?.unlogged).toBe(
      '24 doses non renseignées',
    )
  })

  it('recalcule une ligne réécrite avec un updatedAt plus ancien que le maximum', () => {
    const cache = carnetScheduleCache()
    const noted = dose('2026-09-03', '2026-09-04', { updatedAt: '2026-09-28T08:00:05.000Z' })
    const book = { ...PANACUR, doses: [...PANACUR.doses, noted] }
    carnetTreatments(t, [book], TODAY, cache)
    const schedule = vi.spyOn(engine, 'treatmentSchedule')
    const [first] = book.periods
    const weekly = {
      ...book,
      periods: [
        {
          ...first!,
          frequency: { value: 1, unit: 'week' as const },
          updatedAt: '2026-09-28T08:00:03.000Z',
        },
      ],
    }

    carnetTreatments(t, [weekly], TODAY, cache)

    expect(schedule).toHaveBeenCalledOnce()
  })

  it('recalcule un traitement dont une prise a disparu, et tous le lendemain', () => {
    const cache = carnetScheduleCache()
    carnetTreatments(t, [MILBEMAX, PANACUR], TODAY, cache)
    const schedule = vi.spyOn(engine, 'treatmentSchedule')

    carnetTreatments(t, [MILBEMAX, { ...PANACUR, doses: PANACUR.doses.slice(1) }], TODAY, cache)
    expect(schedule).toHaveBeenCalledOnce()

    carnetTreatments(t, [MILBEMAX, PANACUR], '2026-09-29', cache)
    expect(schedule).toHaveBeenCalledTimes(3)
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(row(PANACUR)).toMatchObject({
      detail: 'Today’s dose · Sep 28',
      unlogged: '25 doses not logged',
    })
    expect(row(named('Panacur', [period({ stoppedOn: '2026-09-06' })], PANACUR.doses)).badge).toBe(
      'To log',
    )
  })
})

describe('carnetTreatments — traitements terminés (TR-31)', () => {
  const ARRETE = named(
    'Advocate',
    [period({ stoppedOn: '2026-09-04' })],
    [
      dose('2026-09-01', '2026-09-02'),
      dose('2026-09-02', '2026-09-03'),
      missed('2026-09-03', '2026-09-04'),
    ],
  )
  const FINI = named(
    'Métacam',
    [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', endsOn: '2026-09-21' })],
    [dose('2026-09-20', '2026-09-21'), dose('2026-09-21', '2026-09-22')],
  )

  it('sort des traitements en cours celui qui n’a plus rien à renseigner', () => {
    const { ongoing, finished, summary } = carnet([ARRETE, FINI, MILBEMAX])

    expect(ongoing.map(({ name }) => name)).toEqual(['Milbemax'])
    expect(finished).toEqual([
      { id: 'métacam', name: 'Métacam', detail: 'Terminé le 21 sept. · 2 prises' },
      { id: 'advocate', name: 'Advocate', detail: 'Arrêté le 4 sept. · 2 prises' },
    ])
    expect(summary).toEqual({ total: 1, overdue: 0, ongoing: 1 })
  })

  it('date un traitement fini avant sa date de fin de sa dernière échéance', () => {
    const avant = named(
      'Drontal',
      [period({ ...HEBDO, endsOn: '2026-09-30' })],
      [
        dose('2026-09-07', '2026-09-14'),
        dose('2026-09-14', '2026-09-21'),
        dose('2026-09-21', '2026-09-28'),
        dose('2026-09-28', '2026-10-05'),
      ],
    )

    expect(carnet([avant], '2026-09-29').finished[0]!.detail).toBe('Terminé le 28 sept. · 4 prises')
  })

  it('compte une prise en plus parmi les prises', () => {
    const arrete = named(
      'Drontal',
      [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', stoppedOn: '2026-09-21' })],
      [dose('2026-09-20', '2026-09-21'), extra('2026-09-20', '2026-09-21')],
    )

    expect(carnet([arrete]).finished[0]!.detail).toBe('Arrêté le 21 sept. · 2 prises')
  })

  it('accorde le nombre de prises, et donne l’année d’une autre année', () => {
    const ancien = named(
      'Drontal',
      [period({ startsOn: '2025-05-26', firstDueOn: '2025-05-26', stoppedOn: '2025-05-27' })],
      [dose('2025-05-26', '2025-05-27')],
    )

    expect(carnet([ancien]).finished[0]!.detail).toBe('Arrêté le 27 mai 2025 · 1 prise')
  })
})
