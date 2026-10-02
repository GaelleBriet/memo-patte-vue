import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, postponed, treatment } from './treatment-fixtures'
import {
  LINES_BEFORE_TOGGLE,
  finishedTreatmentRows,
  treatmentDeleteTexts,
  treatmentHistory,
} from '../logic/treatment-history'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

function history(book: TreatmentWithHistory, today: string) {
  return plain(treatmentHistory(t, book, treatmentScheduleOf(book, today)))
}

function titles(book: TreatmentWithHistory, today: string): string[][] {
  return history(book, today).periods.map(({ lines }) => lines.map(({ title }) => title))
}

/** Une prise donnée chaque jour, à chaque heure de la période. */
function daily(
  from: number,
  to: number,
  times: (string | null)[],
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose[] {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const day = `2026-09-${String(from + index).padStart(2, '0')}`
    return times.map((dueTime) => dose(day, day, { dueTime, ...overrides }))
  }).flat()
}

afterEach(() => applyLocale('fr'))

describe('treatmentHistory — une période (planches A · V1 quinquies bis, V5 bis)', () => {
  const TRIMESTRIEL = period({
    frequency: { value: 3, unit: 'month' },
    startsOn: '2025-10-10',
    firstDueOn: '2025-10-10',
  })
  const MILBEMAX = treatment(
    [TRIMESTRIEL],
    [
      dose('2025-10-10', '2026-01-10'),
      dose('2026-01-10', '2026-04-10'),
      dose('2026-04-10', '2026-07-10'),
      dose('2026-07-10', '2026-10-10'),
      postponed('2026-10-10', '2026-10-14', { createdAt: '2026-09-28T08:00:00.000Z' }),
    ],
  )

  it('compte les prises données depuis la première, sans tête de période', () => {
    const { counter, periods } = history(MILBEMAX, '2026-09-28')

    expect(counter).toBe('4 depuis le 10 oct. 2025')
    expect(periods).toHaveLength(1)
    expect(periods[0]).toMatchObject({ head: null, emptyText: null })
  })

  it('met le report en ligne discrète, la dernière prise en avant, le reste derrière « Voir »', () => {
    const [only] = history(MILBEMAX, '2026-09-28').periods

    expect(only!.lines).toMatchObject([
      {
        kind: 'move',
        title: 'Reportée au 14 oct. 2026 (prévue le 10 oct.)',
        actions: ['change-date', 'remove-move'],
        bounds: { earliest: '2026-09-28', latest: null },
        optionsLabel: 'Options pour le report de la dose du 10 octobre 2026',
      },
      {
        kind: 'given',
        title: '10 juil. 2026',
        detail: null,
        isLast: true,
        actions: ['change-date', 'mark-missed', 'remove'],
        optionsLabel: 'Options pour la prise du 10 juillet 2026',
      },
      { kind: 'given', title: '10 avr. 2026', isLast: false },
      { kind: 'given', title: '10 janv. 2026' },
      { kind: 'given', title: '10 oct. 2025' },
    ])
    expect(only).toMatchObject({
      visibleLines: LINES_BEFORE_TOGGLE,
      toggle: {
        show: 'Voir les 2 prises précédentes',
        hide: 'Masquer les prises précédentes',
      },
    })
  })

  it('dit « Avancée » quand la nouvelle date précède l’échéance', () => {
    const book = treatment(
      [TRIMESTRIEL],
      [
        dose('2026-07-10', '2026-10-10'),
        postponed('2026-10-10', '2026-10-08', { createdAt: '2026-09-28T08:00:00.000Z' }),
      ],
    )

    expect(titles(book, '2026-09-28')[0]![0]).toBe('Avancée au 8 oct. 2026 (prévue le 10 oct.)')
  })

  it('retire son menu à un report dont la dose d’arrivée est notée (Q25)', () => {
    const book = treatment(
      [TRIMESTRIEL],
      [
        dose('2026-07-10', '2026-10-10'),
        postponed('2026-10-10', '2026-10-14', { createdAt: '2026-09-28T08:00:00.000Z' }),
        dose('2026-10-14', '2027-01-14', { createdAt: '2026-10-14T08:00:00.000Z' }),
      ],
    )

    expect(history(book, '2026-10-20').periods[0]!.lines).toMatchObject([
      { kind: 'given', title: '14 oct. 2026', isLast: true },
      {
        kind: 'move',
        title: 'Reportée au 14 oct. 2026 (prévue le 10 oct.)',
        actions: [],
        bounds: null,
      },
      { kind: 'given', title: '10 juil. 2026' },
    ])
  })

  it('garde l’échéance en titre d’une prise notée un autre jour, sans heure pour une seule heure', () => {
    const panacur = treatment(
      [
        period({
          startsOn: '2026-10-06',
          firstDueOn: '2026-10-06',
          endsOn: '2026-10-10',
          times: ['20:00'],
        }),
      ],
      [dose('2026-10-06', '2026-10-07', { dueTime: '20:00', givenOn: '2026-10-07' })],
    )

    expect(history(panacur, '2026-10-07')).toMatchObject({
      counter: '1 depuis le 6 oct. 2026',
      periods: [
        {
          lines: [
            { kind: 'given', title: '6 oct. 2026', detail: 'Donnée le 7 oct. 2026', isLast: true },
          ],
          toggle: null,
        },
      ],
    })
  })

  it('dit qu’aucune prise n’est notée', () => {
    const book = treatment([period({ startsOn: '2026-09-29', firstDueOn: '2026-09-29' })])

    expect(history(book, '2026-09-28')).toEqual({
      counter: null,
      periods: [
        {
          id: 'p-1',
          head: null,
          lines: [],
          emptyText: 'Aucune prise dans cette période pour l’instant',
          visibleLines: 0,
          toggle: null,
        },
      ],
    })
  })
})

describe('treatmentHistory — plusieurs périodes (planche A · V3)', () => {
  const AVANT = period({ times: ['08:00'], doseQuantity: 0.5, doseUnit: 'ml' })
  const DEPUIS = period({
    id: 'p-2',
    startsOn: '2026-09-21',
    firstDueOn: '2026-09-21',
    times: ['08:00', '20:00'],
    doseQuantity: 0.3,
    doseUnit: 'ml',
    createdAt: '2026-09-21T08:00:00.000Z',
  })
  const METACAM = treatment(
    [AVANT, DEPUIS],
    [
      ...daily(1, 17, ['08:00']),
      missed('2026-09-18', '2026-09-19', { dueTime: '08:00' }),
      ...daily(19, 20, ['08:00']),
      ...daily(21, 24, ['08:00', '20:00'], { periodId: 'p-2' }),
      missed('2026-09-25', '2026-09-25', { dueTime: '08:00', periodId: 'p-2' }),
      missed('2026-09-25', '2026-09-26', { dueTime: '20:00', periodId: 'p-2' }),
      ...daily(26, 27, ['08:00', '20:00'], { periodId: 'p-2' }),
      dose('2026-09-28', '2026-09-28', { dueTime: '08:00', periodId: 'p-2' }),
    ],
  )

  it('compte les seules prises données', () => {
    expect(history(METACAM, '2026-09-28').counter).toBe('32 depuis le 1 sept. 2026')
  })

  it('met en tête de chaque période ses dates et ses réglages, la plus récente d’abord', () => {
    expect(history(METACAM, '2026-09-28').periods.map(({ head }) => head)).toEqual([
      { title: 'Depuis le 21 sept. 2026', settings: 'Tous les jours · 8 h et 20 h · 0,3 ml' },
      { title: 'Du 1 sept. au 20 sept. 2026', settings: 'Tous les jours · 8 h · 0,5 ml' },
    ])
  })

  it('donne l’heure des prises d’une période à plusieurs heures, et regroupe les oubliées qui se suivent', () => {
    const [current, previous] = titles(METACAM, '2026-09-28')

    expect(current!.slice(0, 8)).toEqual([
      '28 sept. 2026 · 8 h',
      '27 sept. 2026 · 20 h',
      '27 sept. 2026 · 8 h',
      '26 sept. 2026 · 20 h',
      '26 sept. 2026 · 8 h',
      'Oubliées · 25 sept. 2026, 8 h et 20 h',
      '24 sept. 2026 · 20 h',
      '24 sept. 2026 · 8 h',
    ])
    expect(previous!.slice(0, 4)).toEqual([
      '20 sept. 2026',
      '19 sept. 2026',
      'Oubliée · 18 sept. 2026',
      '17 sept. 2026',
    ])
  })

  it('garde chaque prise oubliée d’un groupe, avec son menu', () => {
    const group = history(METACAM, '2026-09-28').periods[0]!.lines[5]

    expect(group).toMatchObject({
      kind: 'missed',
      rows: [
        {
          title: 'Oubliée · 25 sept. 2026, 20 h',
          actions: ['mark-given', 'remove'],
          optionsLabel: 'Options pour la prise du 25 septembre 2026 à 20 h',
        },
        { title: 'Oubliée · 25 sept. 2026, 8 h' },
      ],
    })
  })

  it('replie chaque période après ses premières lignes, et compte les prises repliées', () => {
    const [current, previous] = history(METACAM, '2026-09-28').periods

    expect(current!.toggle).toEqual({
      show: 'Voir les 12 autres prises de cette période',
      hide: 'Masquer les autres prises de cette période',
    })
    expect(previous!.toggle).toEqual({
      show: 'Voir les 17 prises précédentes',
      hide: 'Masquer les prises précédentes',
    })
  })

  it('met « Dernière prise » sur la dernière donnée, une seule fois', () => {
    const lines = history(METACAM, '2026-09-28').periods.flatMap(({ lines }) => lines)

    expect(lines.filter((line) => line.kind === 'given' && line.isLast)).toMatchObject([
      { title: '28 sept. 2026 · 8 h' },
    ])
  })

  it('dit qu’une période ouverte par « Modifier » n’a pas encore de prise', () => {
    const book = treatment(
      [
        period({ frequency: { value: 1, unit: 'week' } }),
        period({
          id: 'p-2',
          startsOn: '2026-09-29',
          firstDueOn: '2026-09-29',
          frequency: { value: 15, unit: 'day' },
          createdAt: '2026-09-29T08:00:00.000Z',
        }),
      ],
      [dose('2026-09-01', '2026-09-08'), dose('2026-09-08', '2026-09-15')],
    )

    expect(history(book, '2026-09-29').periods[0]).toMatchObject({
      head: { title: 'Depuis le 29 sept. 2026', settings: 'Tous les 15 jours' },
      lines: [],
      emptyText: 'Aucune prise dans cette période pour l’instant',
    })
  })

  it('écrit « Du … au … » pour une période arrêtée ou à date de fin', () => {
    const book = treatment([
      period({ stoppedOn: '2026-09-10' }),
      period({
        id: 'p-2',
        startsOn: '2026-11-03',
        firstDueOn: '2026-11-03',
        endsOn: '2026-11-07',
        createdAt: '2026-11-03T08:00:00.000Z',
      }),
    ])

    expect(history(book, '2026-11-03').periods.map(({ head }) => head?.title)).toEqual([
      'Du 3 nov. au 7 nov. 2026',
      'Du 1 sept. au 10 sept. 2026',
    ])
  })

  it('écrit « Le … » pour une période fermée le jour de son ouverture', () => {
    const sameDay = { startsOn: '2026-10-02', firstDueOn: '2026-10-02' }
    const reopened = period({ ...sameDay, id: 'p-3', createdAt: '2026-10-02T10:00:00.000Z' })
    const stopped = treatment([period({ ...sameDay, stoppedOn: '2026-10-02' }), reopened])
    const changed = treatment([period(sameDay), reopened])

    for (const book of [stopped, changed]) {
      expect(history(book, '2026-10-02').periods.map(({ head }) => head?.title)).toEqual([
        'Depuis le 2 oct. 2026',
        'Le 2 oct. 2026',
      ])
    }
    applyLocale('en')
    expect(history(stopped, '2026-10-02').periods[1]!.head?.title).toBe('Oct 2, 2026')
  })

  it('regroupe des oubliées de plusieurs jours', () => {
    const book = treatment(
      [period()],
      [
        dose('2026-09-01', '2026-09-02'),
        missed('2026-09-02', '2026-09-03'),
        missed('2026-09-03', '2026-09-04'),
        missed('2026-09-04', '2026-09-05'),
        dose('2026-09-05', '2026-09-06'),
      ],
    )

    expect(titles(book, '2026-09-05')[0]).toEqual([
      '5 sept. 2026',
      'Oubliées · du 2 sept. au 4 sept. 2026',
      '1 sept. 2026',
    ])
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    const { counter, periods } = history(METACAM, '2026-09-28')

    expect(counter).toBe('32 since Sep 1, 2026')
    expect(periods.map(({ head }) => head?.title)).toEqual([
      'Since Sep 21, 2026',
      'Sep 1 – Sep 20, 2026',
    ])
    expect(periods[0]!.lines[5]!.title).toBe('Missed · Sep 25, 2026, 8 am and 8 pm')
    expect(periods[0]!.toggle!.show).toBe('Show the 12 other doses from this period')
  })
})

describe('treatmentHistory — ce que deux appareils ou un import peuvent laisser', () => {
  it('ne montre qu’une prise par échéance, avec l’état de la ligne modifiée en dernier (critère 12)', () => {
    const book = treatment(
      [period({ times: ['08:00', '20:00'] })],
      [
        dose('2026-09-01', '2026-09-01', { id: 'ici', dueTime: '08:00' }),
        missed('2026-09-01', '2026-09-01', {
          id: 'ailleurs',
          dueTime: '08:00',
          updatedAt: '2026-09-01T12:00:00.000Z',
        }),
        dose('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )

    expect(titles(book, '2026-09-01')[0]).toEqual([
      '1 sept. 2026 · 20 h',
      'Oubliée · 1 sept. 2026, 8 h',
    ])
  })

  it('deux périodes qui se chevauchent : « Dernière prise » reste la dernière donnée, « N prises » les seules données', () => {
    const book = treatment(
      [
        period({ frequency: { value: 1, unit: 'month' } }),
        period({
          id: 'p-2',
          startsOn: '2026-09-15',
          firstDueOn: '2026-09-15',
          frequency: { value: 1, unit: 'month' },
          createdAt: '2026-09-15T08:00:00.000Z',
        }),
      ],
      [
        dose('2026-09-01', '2026-10-01'),
        dose('2026-10-01', '2026-11-01'),
        missed('2026-11-01', '2026-12-01'),
        dose('2026-09-15', '2026-10-15', { periodId: 'p-2' }),
      ],
    )

    const { counter, periods } = history(book, '2026-11-02')

    expect(counter).toBe('3 depuis le 1 sept. 2026')
    expect(
      periods.map(({ lines }) =>
        lines.map((line) => [line.title, line.kind === 'given' && line.isLast]),
      ),
    ).toEqual([
      [['15 sept. 2026', false]],
      [
        ['Oubliée · 1 nov. 2026', false],
        ['1 oct. 2026', true],
        ['1 sept. 2026', false],
      ],
    ])
  })
})

describe('finishedTreatmentRows', () => {
  const BRAVECTO: Treatment = {
    id: 'bravecto',
    animalId: 'boree',
    name: 'Bravecto',
    type: 'deworming',
    periodId: 'bravecto',
    frequency: { value: 1, unit: 'month' },
    lastDoseDate: '2026-08-28',
    nextDueDate: '2026-09-28',
    stoppedOn: null,
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    deletedAt: null,
  }

  it('annonce la date d’arrêt et le nombre de prises de chaque traitement terminé (F9)', () => {
    const milbemax = { ...BRAVECTO, id: 'milbemax', name: 'Milbemax', stoppedOn: '2026-05-26' }
    const drontal = { ...BRAVECTO, id: 'drontal', name: 'Drontal', stoppedOn: '2025-11-02' }

    expect(finishedTreatmentRows(t, [milbemax, drontal], { milbemax: 2, drontal: 1 })).toEqual([
      { id: 'milbemax', name: 'Milbemax', detail: 'Arrêté le 26 mai 2026 · 2 prises' },
      { id: 'drontal', name: 'Drontal', detail: 'Arrêté le 2 nov. 2025 · 1 prise' },
    ])
  })
})

describe('treatmentDeleteTexts', () => {
  it('confirme la suppression du traitement, avec ses prises et ses rappels', () => {
    expect(treatmentDeleteTexts(t, 'Bravecto')).toEqual({
      title: 'Supprimer Bravecto ?',
      text: 'Ses prises et ses rappels seront supprimés du carnet. Cette action est définitive.',
      cancel: 'Annuler',
      confirm: 'Supprimer',
      deleted: 'Traitement Bravecto supprimé',
      failed: 'Bravecto n’a pas pu être supprimé. Réessaie.',
    })
  })
})
