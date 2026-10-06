import { afterEach, describe, expect, it } from 'vitest'

import { dose, extra, missed, period, plain, treatment } from './treatment-fixtures'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  sheetDoneTarget,
  sheetOtherDateMin,
  sheetPeriod,
  treatmentSheetTexts,
} from '../logic/treatment-sheet'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

afterEach(() => applyLocale('fr'))

// Pixel, vermifuge tous les vendredis depuis le 9 oct.
const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const DUE_16 = { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null }
const MATIN_ET_SOIR = period({ times: ['08:00', '20:00'] })

describe('sheetDoneTarget — « Fait aujourd’hui » vise l’échéance de la ligne touchée', () => {
  it('dose du jour : un tap, sans décalage à demander', () => {
    const book = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
    const schedule = treatmentScheduleOf(book, '2026-10-16')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-16')).toEqual(
      { kind: 'note', gesture: { kind: 'given', due: DUE_16, givenOn: '2026-10-16' } },
    )
  })

  it('dose en retard : la confirmation avec la case (G20)', () => {
    const book = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
    const schedule = treatmentScheduleOf(book, '2026-10-19')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-19')).toEqual(
      { kind: 'confirm', due: DUE_16 },
    )
  })

  it('dose donnée en avance : la confirmation aussi (principe du 2026-10-06)', () => {
    const book = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
    const schedule = treatmentScheduleOf(book, '2026-10-13')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-13')).toEqual(
      { kind: 'confirm', due: DUE_16 },
    )
  })

  it('à plusieurs heures, l’heure de la ligne, d’un tap le jour même', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-28', '2026-09-28', { dueTime: '08:00' })],
    )
    const schedule = treatmentScheduleOf(book, '2026-09-28')

    expect(
      sheetDoneTarget(schedule, { dueOn: '2026-09-28', dueTime: '20:00' }, '2026-09-28'),
    ).toEqual({
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' },
        givenOn: '2026-09-28',
      },
    })
  })

  it('second geste du jour sur la dose suivante : « déjà notée » (Q33)', () => {
    const book = treatment([period()], [dose('2026-09-28', '2026-09-29')])
    const schedule = treatmentScheduleOf(book, '2026-09-28')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-09-29', dueTime: null }, '2026-09-28')).toEqual(
      { kind: 'already', givenOn: '2026-09-28' },
    )
  })

  it('après une prise en plus du jour, « déjà notée » aussi (Q33)', () => {
    const book = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), extra('2026-10-13', '2026-10-16')],
    )
    const schedule = treatmentScheduleOf(book, '2026-10-13')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-13')).toEqual(
      { kind: 'already', givenOn: '2026-10-13' },
    )
  })

  it('échéance notée entre-temps : « déjà notée », à la date de sa prise (TR-21)', () => {
    const book = treatment(
      [VENDREDI],
      [
        dose('2026-10-09', '2026-10-16'),
        dose('2026-10-16', '2026-10-23', { givenOn: '2026-10-17' }),
      ],
    )
    const schedule = treatmentScheduleOf(book, '2026-10-19')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-19')).toEqual(
      { kind: 'already', givenOn: '2026-10-17' },
    )
  })

  it('échéance notée oubliée entre-temps : l’oubli reste, et la feuille le dit (Q41)', () => {
    const book = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), missed('2026-10-16', '2026-10-23')],
    )
    const schedule = treatmentScheduleOf(book, '2026-10-19')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-16', dueTime: null }, '2026-10-19')).toEqual(
      { kind: 'missed' },
    )
  })

  it('échéance qui n’est plus au calendrier : rien à noter', () => {
    const book = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
    const schedule = treatmentScheduleOf(book, '2026-10-19')

    expect(sheetDoneTarget(schedule, { dueOn: '2026-10-14', dueTime: null }, '2026-10-19')).toEqual(
      { kind: 'none' },
    )
  })
})

describe('treatmentSheetTexts — sous-titre et échéance lus par le moteur', () => {
  const named = { name: 'Milbemax', type: 'deworming' as const }

  it('la fréquence de la période de l’échéance et le jour de la ligne', () => {
    const texts = treatmentSheetTexts(
      t,
      named,
      VENDREDI,
      { dueOn: '2026-10-16', dueTime: null },
      {
        animal: 'Pixel',
        today: '2026-10-19',
      },
    )

    expect(plain(texts.subtitle)).toBe('Vermifuge · Pixel · toutes les semaines')
    expect(plain(texts.due)).toBe('En retard depuis le 16 oct.')
  })

  it('« Prochaine dose » seulement pour une échéance d’aujourd’hui ou à venir (TR-10)', () => {
    const due = (dueOn: string) =>
      treatmentSheetTexts(
        t,
        named,
        MATIN_ET_SOIR,
        { dueOn, dueTime: '20:00' },
        {
          animal: 'Pixel',
          today: '2026-10-19',
        },
      ).due

    expect(plain(due('2026-10-19'))).toBe('Prochaine dose le 19 oct. à 20 h')
    expect(plain(due('2026-10-20'))).toBe('Prochaine dose le 20 oct. à 20 h')
    expect(plain(due('2026-10-18'))).toBe('En retard depuis le 18 oct. à 20 h')
  })

  it('l’heure de la ligne, l’année hors de l’année en cours', () => {
    const texts = treatmentSheetTexts(
      t,
      named,
      MATIN_ET_SOIR,
      { dueOn: '2025-12-30', dueTime: '20:00' },
      { animal: 'Pixel', today: '2026-01-02' },
    )

    expect(plain(texts.subtitle)).toBe('Vermifuge · Pixel · tous les jours')
    expect(plain(texts.due)).toBe('En retard depuis le 30 déc. 2025 à 20 h')
  })

  it('pas de « Prochaine dose » sur la feuille des doses non renseignées', () => {
    const texts = treatmentSheetTexts(t, named, VENDREDI, 'unlogged', {
      animal: 'Pixel',
      today: '2026-10-19',
    })

    expect(texts.due).toBeNull()
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')
    const texts = treatmentSheetTexts(
      t,
      named,
      MATIN_ET_SOIR,
      { dueOn: '2026-10-16', dueTime: '08:00' },
      { animal: 'Pixel', today: '2026-10-19' },
    )

    expect(plain(texts.subtitle)).toBe('Dewormer · Pixel · every day')
    expect(plain(texts.due)).toBe('Overdue since Oct 16 at 8 am')
    expect(
      plain(
        treatmentSheetTexts(
          t,
          named,
          VENDREDI,
          { dueOn: '2026-10-23', dueTime: null },
          {
            animal: 'Pixel',
            today: '2026-10-19',
          },
        ).due,
      ),
    ).toBe('Next dose on Oct 23')
  })
})

describe('sheetPeriod — la période dont la feuille parle', () => {
  const AVANT = period({ frequency: { value: 1, unit: 'week' } })
  const APRES = period({
    id: 'p-2',
    startsOn: '2026-10-05',
    firstDueOn: '2026-10-05',
    createdAt: '2026-10-05T08:00:00.000Z',
  })
  const book = treatment(
    [AVANT, APRES],
    [dose('2026-09-01', '2026-09-08'), dose('2026-10-05', '2026-10-06', { periodId: 'p-2' })],
  )
  const schedule = treatmentScheduleOf(book, '2026-10-06')

  it('celle de l’échéance de la ligne', () => {
    expect(sheetPeriod(book, schedule, { dueOn: '2026-10-06', dueTime: null })?.id).toBe('p-2')
  })

  it('celle des doses non renseignées pour leur ligne', () => {
    expect(sheetPeriod(book, schedule, 'unlogged')?.id).toBe('p-1')
  })

  it('la dernière quand l’échéance n’est plus au calendrier', () => {
    expect(sheetPeriod(book, schedule, { dueOn: '2026-12-25', dueTime: null })?.id).toBe('p-2')
    expect(sheetPeriod(book, null, null)?.id).toBe('p-2')
  })
})

describe('sheetOtherDateMin — premier jour de « Fait à une autre date »', () => {
  const book = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
  const schedule = treatmentScheduleOf(book, '2026-10-19')
  const ligne = { dueOn: '2026-10-16', dueTime: null }

  it('le lendemain de la dose précédente : avant, la prise serait une prise en plus (G11)', () => {
    expect(sheetOtherDateMin(book, schedule, ligne, '2026-04-10')).toBe('2026-10-10')
  })

  it('jamais avant la naissance de l’animal', () => {
    expect(sheetOtherDateMin(book, schedule, ligne, '2026-10-12')).toBe('2026-10-12')
  })

  it('la naissance seule quand l’échéance n’est plus à noter', () => {
    const noted = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), dose('2026-10-16', '2026-10-23')],
    )
    expect(
      sheetOtherDateMin(noted, treatmentScheduleOf(noted, '2026-10-19'), ligne, '2026-04-10'),
    ).toBe('2026-04-10')
  })
})
