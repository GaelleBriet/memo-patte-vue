import { afterEach, describe, expect, it } from 'vitest'

import { dose, extra, missed, period, plain, postponed, treatment } from './treatment-fixtures'
import {
  earliestGivenOn,
  givenWhenMin,
  givenWhenTexts,
  isEveryDay,
  notificationTarget,
} from '../logic/treatment-notification'
import { notifiedPlan } from '../logic/treatment-other-date'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

const QUOTIDIEN_20H = period({ startsOn: '2026-10-01', firstDueOn: '2026-10-01', times: ['20:00'] })
const MATIN_ET_SOIR = period({
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  times: ['08:00', '20:00'],
})
const VENDREDIS = period({
  startsOn: '2026-10-02',
  firstDueOn: '2026-10-02',
  frequency: { value: 1, unit: 'week' },
})
const TOUS_LES_3_JOURS = period({
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  frequency: { value: 3, unit: 'day' },
  times: ['08:00', '20:00'],
})

function target(book: TreatmentWithHistory, today: string, dueOn: string, dueTime: string | null) {
  return notificationTarget(treatmentScheduleOf(book, today), { dueOn, dueTime }, today)
}

afterEach(() => applyLocale('fr'))

describe('notificationTarget — ce que fait « C’est fait » d’une notification', () => {
  it('RA-18, TR-20 : notification du jour, note son échéance, jour et heure', () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-06', '2026-10-07', { dueTime: '20:00' })],
    )

    expect(target(book, '2026-10-07', '2026-10-07', '20:00')).toEqual({
      kind: 'note',
      due: { periodId: 'p-1', dueOn: '2026-10-07', dueTime: '20:00' },
    })
  })

  it('critère 6 des Rappels, 11 des Traitements : notification de la veille, demande « Donnée quand ? »', () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-05', '2026-10-06', { dueTime: '20:00' })],
    )

    expect(target(book, '2026-10-07', '2026-10-06', '20:00')).toEqual({ kind: 'given-when' })
  })

  it('relance d’un hebdomadaire : demande « Donnée quand ? », sans rien noter d’office', () => {
    const book = treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')])

    expect(target(book, '2026-10-12', '2026-10-09', null)).toEqual({ kind: 'given-when' })
  })

  it('Q32 levée : la notification de 20 h note 20 h quand 8 h est déjà notée', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-10-07', '2026-10-07', { dueTime: '08:00' })],
    )

    expect(target(book, '2026-10-07', '2026-10-07', '20:00')).toEqual({
      kind: 'note',
      due: { periodId: 'p-1', dueOn: '2026-10-07', dueTime: '20:00' },
    })
  })

  it('TR-21, Q33 : échéance déjà notée, « déjà notée » avec le jour de la prise', () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-07', '2026-10-08', { dueTime: '20:00' })],
    )

    expect(target(book, '2026-10-07', '2026-10-07', '20:00')).toEqual({
      kind: 'already',
      givenOn: '2026-10-07',
    })
  })

  it('Q33 : une dose donnée en avance couvre son échéance', () => {
    const book = treatment(
      [VENDREDIS],
      [
        dose('2026-10-02', '2026-10-09'),
        dose('2026-10-09', '2026-10-16', { givenOn: '2026-10-07' }),
      ],
    )

    expect(target(book, '2026-10-09', '2026-10-09', null)).toEqual({
      kind: 'already',
      givenOn: '2026-10-07',
    })
  })

  it('G11 : une prise en plus ne couvre aucune échéance', () => {
    const book = treatment(
      [VENDREDIS],
      [
        dose('2026-10-02', '2026-10-09'),
        dose('2026-10-09', '2026-10-16'),
        extra('2026-10-14', '2026-10-16'),
      ],
    )

    expect(target(book, '2026-10-16', '2026-10-16', null)).toEqual({
      kind: 'note',
      due: { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null },
    })
  })

  it('Q41 : un oubli ne redevient pas donné, la feuille s’ouvre', () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [missed('2026-10-07', '2026-10-08', { dueTime: '20:00' })],
    )

    expect(target(book, '2026-10-07', '2026-10-07', '20:00')).toEqual({ kind: 'sheet' })
  })

  it('une échéance reportée n’est plus celle de la notification : la feuille s’ouvre', () => {
    const book = treatment(
      [VENDREDIS],
      [dose('2026-10-02', '2026-10-09'), postponed('2026-10-09', '2026-10-12')],
    )

    expect(target(book, '2026-10-09', '2026-10-09', null)).toEqual({ kind: 'sheet' })
  })

  it('un traitement arrêté n’a plus de dose à noter', () => {
    const book = treatment(
      [{ ...VENDREDIS, stoppedOn: '2026-10-05' }],
      [dose('2026-10-02', '2026-10-09')],
    )

    expect(target(book, '2026-10-09', '2026-10-09', null)).toEqual({ kind: 'none' })
  })

  it('TR-23 bis : relance d’un jour à plusieurs heures, « Donnée quand ? » puis l’heure', () => {
    const book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-01', '2026-10-01', { dueTime: '08:00' }),
        dose('2026-10-01', '2026-10-04', { dueTime: '20:00' }),
      ],
    )

    expect(target(book, '2026-10-07', '2026-10-04', null)).toEqual({ kind: 'given-when' })
  })

  it('relance d’un jour dont toutes les heures sont notées depuis : « déjà notée »', () => {
    const book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-04', '2026-10-04', { dueTime: '08:00', givenOn: '2026-10-05' }),
        dose('2026-10-04', '2026-10-07', { dueTime: '20:00', givenOn: '2026-10-05' }),
      ],
    )

    expect(target(book, '2026-10-07', '2026-10-04', null)).toEqual({
      kind: 'already',
      givenOn: '2026-10-05',
    })
  })

  it('Q41 : relance d’un jour avec une heure donnée et une oubliée, la feuille montre la journée', () => {
    const book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-04', '2026-10-04', { dueTime: '08:00', givenOn: '2026-10-05' }),
        missed('2026-10-04', '2026-10-07', { dueTime: '20:00' }),
      ],
    )

    expect(target(book, '2026-10-07', '2026-10-04', null)).toEqual({ kind: 'sheet' })
  })
})

describe('givenWhenMin — borne du calendrier de « Une autre date »', () => {
  const DOSE_9 = { periodId: 'p-1', dueOn: '2026-10-09', dueTime: null }
  const schedule = () =>
    treatmentScheduleOf(treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')]), '2026-10-12')

  it.each([
    [null, '2026-10-03'],
    ['2026-01-10', '2026-10-03'],
    ['2026-10-05', '2026-10-05'],
  ])('naissance %s : %s', (birthDate, expected) => {
    expect(givenWhenMin(schedule(), VENDREDIS, DOSE_9, birthDate)).toBe(expected)
  })

  it('sans borne du moteur, la naissance seule', () => {
    const book = treatment([TOUS_LES_3_JOURS])
    const due = { periodId: 'p-1', dueOn: '2026-10-04', dueTime: '20:00' }
    const plan = treatmentScheduleOf(book, '2026-10-07')

    expect(givenWhenMin(plan, TOUS_LES_3_JOURS, due, null)).toBeNull()
    expect(givenWhenMin(plan, TOUS_LES_3_JOURS, due, '2026-05-01')).toBe('2026-05-01')
  })
})

describe('notifiedPlan — l’échéance de la notification, ou ses heures', () => {
  it('une heure précise : l’échéance, sans heure à choisir', () => {
    const book = treatment([MATIN_ET_SOIR])
    const schedule = treatmentScheduleOf(book, '2026-10-07')

    expect(notifiedPlan(t, schedule, { dueOn: '2026-10-06', dueTime: '20:00' })).toEqual({
      hours: [],
      due: { periodId: 'p-1', dueOn: '2026-10-06', dueTime: '20:00' },
    })
  })

  it('la relance d’un jour à plusieurs heures : chaque heure, un oubli non sélectionnable (Q41)', () => {
    const book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-01', '2026-10-01', { dueTime: '08:00' }),
        dose('2026-10-01', '2026-10-04', { dueTime: '20:00' }),
        missed('2026-10-04', '2026-10-04', { dueTime: '08:00' }),
      ],
    )
    const schedule = treatmentScheduleOf(book, '2026-10-07')

    expect(plain(notifiedPlan(t, schedule, { dueOn: '2026-10-04', dueTime: null }))).toEqual({
      due: null,
      hours: [
        { time: '08:00', label: '8 h', detail: 'Dose de 8 h · notée oubliée', due: null },
        {
          time: '20:00',
          label: '20 h',
          detail: 'Dose de 20 h · pas encore notée',
          due: { periodId: 'p-1', dueOn: '2026-10-04', dueTime: '20:00' },
        },
      ],
    })
  })
})

describe('earliestGivenOn — « Une autre date » note toujours l’échéance de la notification', () => {
  it('G11 : pas un intervalle ou plus avant l’échéance, ce serait une prise en plus', () => {
    const book = treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')])
    const schedule = treatmentScheduleOf(book, '2026-10-12')

    expect(
      earliestGivenOn(schedule, VENDREDIS, { periodId: 'p-1', dueOn: '2026-10-09', dueTime: null }),
    ).toBe('2026-10-03')
  })

  it('à plusieurs heures par jour, aucune prise n’est en plus : pas de borne', () => {
    const book = treatment([TOUS_LES_3_JOURS])
    const schedule = treatmentScheduleOf(book, '2026-10-07')

    expect(
      earliestGivenOn(schedule, TOUS_LES_3_JOURS, {
        periodId: 'p-1',
        dueOn: '2026-10-04',
        dueTime: '20:00',
      }),
    ).toBeNull()
  })
})

describe('isEveryDay — Q3', () => {
  it.each([
    [{ value: 1, unit: 'day' }, true],
    [{ value: 2, unit: 'day' }, false],
    [{ value: 1, unit: 'week' }, false],
  ] as const)('%o : %s', (frequency, expected) => {
    expect(isEveryDay(period({ frequency }))).toBe(expected)
  })
})

describe('givenWhenTexts — « Donnée quand ? » (planche A · V5)', () => {
  const due = { periodId: 'p-1', dueOn: '2026-10-06', dueTime: '20:00' }
  const PANACUR = { name: 'Panacur', animal: 'Pixel', today: '2026-10-07', dosage: null }

  it('dit le jour prévu, avec son heure, et aujourd’hui', () => {
    expect(plain(givenWhenTexts(t, { ...PANACUR, dosage: '½ comprimé' }, due))).toEqual({
      subtitle: 'Panacur · Pixel',
      due: '½ comprimé · prévue mardi 6 oct. à 20 h',
      scheduled: {
        label: 'Mardi 6 oct.',
        detail: 'Le jour prévu, à 20 h',
        aria: 'Donnée le jour prévu, 6 octobre 2026 à 20 h',
      },
      today: {
        label: 'Aujourd’hui',
        detail: 'Mercredi 7 oct.',
        aria: 'Donnée aujourd’hui, 7 octobre 2026',
      },
      other: { label: 'Une autre date', aria: 'Donnée à une autre date : choisir le jour' },
      everyDay: { label: 'Donnée le mardi 6 oct. à 20 h', aria: 'Donnée le 6 octobre 2026 à 20 h' },
    })
  })

  it('sans heure, ou pour la relance d’un jour à plusieurs heures', () => {
    const texts = plain(
      givenWhenTexts(
        t,
        { name: 'Milbemax', animal: 'Milo', today: '2026-10-12', dosage: null },
        { dueOn: '2026-10-09', dueTime: null },
      ),
    )

    expect(texts.subtitle).toBe('Milbemax · Milo')
    expect(texts.due).toBe('Prévue vendredi 9 oct.')
    expect(texts.scheduled).toEqual({
      label: 'Vendredi 9 oct.',
      detail: 'Le jour prévu',
      aria: 'Donnée le jour prévu, 9 octobre 2026',
    })
    expect(texts.everyDay.label).toBe('Donnée le vendredi 9 oct.')
  })

  it('en anglais', () => {
    applyLocale('en')

    const texts = plain(givenWhenTexts(t, { ...PANACUR, dosage: '½ tablet' }, due))

    expect(texts.subtitle).toBe('Panacur · Pixel')
    expect(texts.due).toBe('½ tablet · due Tuesday, Oct 6 at 8 pm')
    expect(plain(givenWhenTexts(t, PANACUR, due)).due).toBe('Due Tuesday, Oct 6 at 8 pm')
    expect(texts.scheduled).toEqual({
      label: 'Tuesday, Oct 6',
      detail: 'The scheduled day, at 8 pm',
      aria: 'Given on the scheduled day, October 6, 2026 at 8 pm',
    })
    expect(texts.today.label).toBe('Today')
    expect(texts.other.label).toBe('Another day')
    expect(texts.everyDay.label).toBe('Given on Tuesday, Oct 6 at 8 pm')
  })
})
