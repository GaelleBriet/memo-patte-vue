// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { REMINDER_DONE_ACTION_TYPE } from '@/core/notifications/reminder-actions'
import type { Reminder } from '@/core/notifications'
import { parseReminderKey } from '../domain/due-reminders'
import { MAX_SCHEDULED_REMINDERS } from '../domain/due-reminders-schedule'
import {
  MAX_REMINDERS_PER_CARE,
  plannedReminders,
  treatmentReminderPlan,
  vaccinationReminderPlan,
  type CarnetReminderSettings,
  type TreatmentReminderPeriod,
} from '../domain/reminder-plan'
import type { TreatmentPeriodInput } from '../domain/treatment-schedule'
import { carnet, period, scheduleOf, stored } from './treatment-schedule-fixtures'

const t = i18n.global.t
const ID = '55555555-5555-4555-8555-555555555555'
const NBSP = ' '
const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }
const RELAY_PIXEL = 'Pour continuer à recevoir les rappels de Pixel, ouvre MémoPatte.'

let previousTz: string | undefined

beforeAll(() => {
  previousTz = process.env.TZ
  process.env.TZ = 'Europe/Paris'
})

afterAll(() => {
  process.env.TZ = previousTz
})

afterEach(() => {
  process.env.TZ = 'Europe/Paris'
  i18n.global.locale.value = 'fr'
})

type Setup = {
  input?: Partial<TreatmentPeriodInput>
  reminders?: Partial<Omit<TreatmentReminderPeriod, keyof TreatmentPeriodInput>>
  doses?: Parameters<typeof stored>[0][]
  today: string
  now: Date
  settings?: CarnetReminderSettings
  id?: string
}

function plan({ input = {}, reminders = {}, doses = [], today, now, settings, id = ID }: Setup) {
  const periodInput = period(input)
  const book = { ...carnet(periodInput), doses: doses.map((fields) => stored(fields)) }
  return treatmentReminderPlan(
    t,
    {
      id,
      name: 'Panacur',
      animalName: 'Pixel',
      period: {
        ...periodInput,
        reminderOffsetMinutes: null,
        reminderTime: null,
        doseQuantity: null,
        doseUnit: null,
        ...reminders,
      },
      schedule: scheduleOf(book, today),
    },
    settings ?? SETTINGS,
    now,
  )
}

/** `jour:heure:moment` du rappel, sans le préfixe de l'entrée. */
function slot(key: string, id = ID): string {
  return key.slice(`treatment:${id}:`.length)
}

function slots(list: readonly Reminder[], id = ID): string[] {
  return list.map(({ key }) => slot(key, id))
}

const HALF_TABLET = { doseQuantity: 0.5, doseUnit: 'tablet' as const }

describe('treatmentReminderPlan, rappel du jour', () => {
  it('critère 1 : quotidien à 20 h « À l’heure », un rappel à 20 h avec la posologie et « C’est fait », sans prévenance ni relance', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-06', times: ['20:00'], endsOn: '2026-10-10' },
      reminders: { reminderOffsetMinutes: 0, ...HALF_TABLET },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders[0]).toEqual({
      key: `treatment:${ID}:2026-10-06:2000:due`,
      title: `Panacur de Pixel à 20${NBSP}h`,
      body: `½${NBSP}comprimé`,
      at: new Date(2026, 9, 6, 20),
      actionTypeId: REMINDER_DONE_ACTION_TYPE,
    })
    expect(slots(reminders)).toEqual([
      '2026-10-06:2000:due',
      '2026-10-07:2000:due',
      '2026-10-08:2000:due',
      '2026-10-09:2000:due',
      '2026-10-10:2000:due',
    ])
  })

  it('RA-1 : un rappel par heure à plusieurs heures', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-06', times: ['20:00', '08:00'], endsOn: '2026-10-07' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 7),
    })

    expect(slots(reminders)).toEqual([
      '2026-10-06:0800:due',
      '2026-10-06:2000:due',
      '2026-10-07:0800:due',
      '2026-10-07:2000:due',
    ])
    expect(reminders.map(({ at }) => at)).toEqual([
      new Date(2026, 9, 6, 8),
      new Date(2026, 9, 6, 20),
      new Date(2026, 9, 7, 8),
      new Date(2026, 9, 7, 20),
    ])
  })

  it.each([
    [0, new Date(2026, 9, 6, 20)],
    [15, new Date(2026, 9, 6, 19, 45)],
    [30, new Date(2026, 9, 6, 19, 30)],
    [60, new Date(2026, 9, 6, 19)],
  ])('RA-7 : %i min avant, le rappel sonne à l’heure moins le décalage', (offset, at) => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-06', times: ['20:00'], endsOn: '2026-10-06' },
      reminders: { reminderOffsetMinutes: offset as 0 | 15 | 30 | 60 },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders.map((reminder) => reminder.at)).toEqual([at])
    expect(reminders[0]?.title).toBe(`Panacur de Pixel à 20${NBSP}h`)
  })

  it('RA-7 : un rappel avant minuit passe la veille', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-07', times: ['00:15'], endsOn: '2026-10-07' },
      reminders: { reminderOffsetMinutes: 30 },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders.map(({ key, at }) => [slot(key), at])).toEqual([
      ['2026-10-07:0015:due', new Date(2026, 9, 6, 23, 45)],
    ])
  })

  it('RA-8 : sans heure, le rappel sonne à l’heure choisie, 9 h par défaut, « aujourd’hui »', () => {
    const at = (reminderTime: string | null) =>
      plan({
        input: { firstDueOn: '2026-10-10', endsOn: '2026-10-10' },
        reminders: { reminderTime },
        today: '2026-10-06',
        now: new Date(2026, 9, 6, 12),
      }).reminders.map(({ key, title, at }) => ({ key: slot(key), title, at }))

    expect(at(null)).toEqual([
      {
        key: '2026-10-10::due',
        title: 'Panacur de Pixel aujourd’hui',
        at: new Date(2026, 9, 10, 9),
      },
    ])
    expect(at('07:30')).toEqual([
      {
        key: '2026-10-10::due',
        title: 'Panacur de Pixel aujourd’hui',
        at: new Date(2026, 9, 10, 7, 30),
      },
    ])
  })

  it('sans posologie, le texte s’arrête au titre', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-06', times: ['20:00'], endsOn: '2026-10-06' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders[0]?.body).toBe('')
  })

  it('RA-16 : trois soins à 9 h, trois notifications', () => {
    const cares = ['a', 'b', 'c'].map((suffix) =>
      plan({
        id: `${ID.slice(0, -1)}${suffix}`,
        input: { firstDueOn: '2026-10-10', endsOn: '2026-10-10' },
        today: '2026-10-06',
        now: new Date(2026, 9, 6, 12),
      }),
    )
    const scheduled = plannedReminders(cares, MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(3)
    expect(new Set(scheduled.map(({ key }) => key)).size).toBe(3)
    expect(scheduled.every(({ at }) => at.getTime() === new Date(2026, 9, 10, 9).getTime())).toBe(
      true,
    )
  })
})

describe('treatmentReminderPlan, prévenance et relance', () => {
  it('critère 2 : tous les 3 mois sans heure, 3 jours avant à 9 h sans bouton, le jour même et 3 jours après avec « C’est fait »', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-10', frequency: { value: 3, unit: 'month' } },
      reminders: { doseQuantity: 1, doseUnit: 'tablet' },
      today: '2026-10-01',
      now: new Date(2026, 9, 1, 12),
    })

    expect(reminders.slice(0, 3)).toEqual([
      {
        key: `treatment:${ID}:2026-10-10::before`,
        title: 'Panacur de Pixel dans 3 jours',
        body: 'Vérifie qu’il te reste une dose.',
        at: new Date(2026, 9, 7, 9),
      },
      {
        key: `treatment:${ID}:2026-10-10::due`,
        title: 'Panacur de Pixel aujourd’hui',
        body: `1${NBSP}comprimé`,
        at: new Date(2026, 9, 10, 9),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
      {
        key: `treatment:${ID}:2026-10-10::overdue`,
        title: 'Panacur de Pixel en retard de 3 jours',
        body: 'Pense à donner la dose, puis note la prise dans MémoPatte.',
        at: new Date(2026, 9, 13, 9),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
    ])
  })

  it('RA-2 : pas de prévenance quand « Me prévenir avant l’échéance » est coupé', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-10', frequency: { value: 1, unit: 'month' } },
      settings: { ...SETTINGS, remindBeforeDue: false },
      today: '2026-10-01',
      now: new Date(2026, 9, 1, 12),
    })

    expect(slots(reminders).slice(0, 2)).toEqual(['2026-10-10::due', '2026-10-10::overdue'])
    expect(slots(reminders).some((slot) => slot.endsWith(':before'))).toBe(false)
  })

  it('Q1 : à heure, prévenance et relance sonnent au même moment que le rappel du jour', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-12', times: ['20:00'], frequency: { value: 1, unit: 'week' } },
      reminders: { reminderOffsetMinutes: 30 },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders.slice(0, 3).map(({ key, title, at }) => [slot(key), title, at])).toEqual([
      [
        '2026-10-12:2000:before',
        `Panacur de Pixel dans 3 jours, à 20${NBSP}h`,
        new Date(2026, 9, 9, 19, 30),
      ],
      ['2026-10-12:2000:due', `Panacur de Pixel à 20${NBSP}h`, new Date(2026, 9, 12, 19, 30)],
      [
        '2026-10-12:2000:overdue',
        'Panacur de Pixel en retard de 3 jours',
        new Date(2026, 9, 15, 19, 30),
      ],
    ])
  })

  it('RA-5 et Q1 : à plusieurs heures, une prévenance et une relance par jour, à la première heure', () => {
    const { reminders } = plan({
      input: {
        firstDueOn: '2026-10-12',
        times: ['20:00', '08:00'],
        frequency: { value: 1, unit: 'week' },
      },
      reminders: { reminderOffsetMinutes: 15 },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders.slice(0, 4).map(({ key, title, at }) => [slot(key), title, at])).toEqual([
      [
        '2026-10-12:0800:before',
        `Panacur de Pixel dans 3 jours, à 8${NBSP}h et 20${NBSP}h`,
        new Date(2026, 9, 9, 7, 45),
      ],
      ['2026-10-12:0800:due', `Panacur de Pixel à 8${NBSP}h`, new Date(2026, 9, 12, 7, 45)],
      ['2026-10-12:2000:due', `Panacur de Pixel à 20${NBSP}h`, new Date(2026, 9, 12, 19, 45)],
      [
        '2026-10-12:0800:overdue',
        'Panacur de Pixel en retard de 3 jours',
        new Date(2026, 9, 15, 7, 45),
      ],
    ])
  })

  it('RA-5 : pas de relance quand une prise de ce jour est notée', () => {
    const input = {
      firstDueOn: '2026-10-05',
      times: ['08:00', '20:00'],
      frequency: { value: 1, unit: 'week' as const },
    }
    const noted = {
      periodId: 'p1',
      dueOn: '2026-10-05',
      dueTime: '08:00',
      givenOn: '2026-10-05',
      status: 'given' as const,
      nextDueDate: '2026-10-12',
    }
    const now = new Date(2026, 9, 6, 12)

    const untouched = plan({ input, today: '2026-10-06', now })
    const halfDone = plan({ input, doses: [noted], today: '2026-10-06', now })

    expect(slots(untouched.reminders)).toContain('2026-10-05:0800:overdue')
    expect(slots(halfDone.reminders).some((slot) => slot.startsWith('2026-10-05'))).toBe(false)
  })

  it.each([
    ['tous les jours', 1],
    ['tous les 3 jours', 3],
  ])('RA-4 : %s, le jour même seul', (_, value) => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-10', frequency: { value, unit: 'day' } },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(slots(reminders).every((slot) => slot.endsWith(':due'))).toBe(true)
  })

  it('RA-4 : tous les 4 jours, prévenance et relance restent entre deux échéances', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-10', frequency: { value: 4, unit: 'day' } },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    const firsts = reminders.slice(0, 7)

    expect(slots(firsts).map((slot, index) => [slot, firsts[index]?.at.getDate()])).toEqual([
      ['2026-10-10::before', 7],
      ['2026-10-10::due', 10],
      ['2026-10-14::before', 11],
      ['2026-10-10::overdue', 13],
      ['2026-10-14::due', 14],
      ['2026-10-18::before', 15],
      ['2026-10-14::overdue', 17],
    ])
  })
})

describe('treatmentReminderPlan, RA-6', () => {
  it('aucun rappel pour une dose non renseignée', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-01', times: ['20:00'], endsOn: '2026-10-08' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(slots(reminders)).toEqual([
      '2026-10-06:2000:due',
      '2026-10-07:2000:due',
      '2026-10-08:2000:due',
    ])
  })

  it('aucun rappel après la date de fin, relance comprise', () => {
    const { reminders } = plan({
      input: {
        firstDueOn: '2026-10-12',
        frequency: { value: 1, unit: 'week' },
        endsOn: '2026-10-19',
      },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(slots(reminders)).toEqual([
      '2026-10-12::before',
      '2026-10-12::due',
      '2026-10-12::overdue',
      '2026-10-19::before',
      '2026-10-19::due',
    ])
  })

  it('aucun rappel pour un traitement arrêté', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-01', stoppedOn: '2026-10-05' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders).toEqual([])
  })

  it('aucun rappel pour un traitement fini par sa date de fin', () => {
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-01', endsOn: '2026-10-04' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders).toEqual([])
  })
})

describe('plannedReminders, plafond et relais', () => {
  it('quotidien à deux heures sur un an : plafonné par soin, sous 400, le dernier porte le relais avec la posologie', () => {
    const care = plan({
      input: { firstDueOn: '2026-10-06', times: ['08:00', '20:00'], endsOn: '2027-10-05' },
      reminders: HALF_TABLET,
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 7),
    })
    const scheduled = plannedReminders([care], MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(MAX_REMINDERS_PER_CARE)
    expect(MAX_REMINDERS_PER_CARE).toBeLessThan(MAX_SCHEDULED_REMINDERS)
    expect(scheduled.at(-1)?.body).toBe(`½${NBSP}comprimé\n${RELAY_PIXEL}`)
    expect(scheduled.at(-1)?.actionTypeId).toBe(REMINDER_DONE_ACTION_TYPE)
    expect(scheduled.slice(0, -1).every(({ body }) => body === `½${NBSP}comprimé`)).toBe(true)
  })

  it('critère 4 : quotidien sans fin, le dernier rappel programmé porte le relais', () => {
    const care = plan({
      input: { firstDueOn: '2026-10-06' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 7),
    })
    const scheduled = plannedReminders([care], MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(MAX_REMINDERS_PER_CARE)
    expect(scheduled.at(-1)?.body).toBe(RELAY_PIXEL)
    expect(scheduled.filter(({ body }) => body.includes(RELAY_PIXEL))).toHaveLength(1)
  })

  it('pas de relais quand une date de fin proche laisse tout programmer', () => {
    const care = plan({
      input: { firstDueOn: '2026-10-06', times: ['08:00', '20:00'], endsOn: '2026-10-10' },
      reminders: HALF_TABLET,
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 7),
    })
    const scheduled = plannedReminders([care], MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(10)
    expect(scheduled.some(({ body }) => body.includes(RELAY_PIXEL))).toBe(false)
  })

  it('pas de relais au plafond exact : toutes les échéances restantes sont programmées', () => {
    const doses = MAX_REMINDERS_PER_CARE
    const care = plan({
      input: { firstDueOn: '2026-10-06', endsOn: dayAfter('2026-10-06', doses - 1) },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 7),
    })
    const scheduled = plannedReminders([care], MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(doses)
    expect(scheduled.some(({ body }) => body.includes(RELAY_PIXEL))).toBe(false)
  })

  it('critère 5 : au plafond global, les plus proches gardés, la prochaine échéance de chaque soin comprise, chaque soin coupé avec son relais', () => {
    const now = new Date(2026, 9, 6, 7)
    const dailies = Array.from({ length: 8 }, (_, index) =>
      plan({
        id: `${ID.slice(0, -2)}${String(index).padStart(2, '0')}`,
        input: { firstDueOn: '2026-10-06' },
        today: '2026-10-06',
        now,
      }),
    )
    const farId = `${ID.slice(0, -2)}99`
    const far = plan({
      id: farId,
      input: { firstDueOn: '2027-06-01', frequency: { value: 1, unit: 'month' } },
      today: '2026-10-06',
      now,
    })
    const scheduled = plannedReminders([...dailies, far], MAX_SCHEDULED_REMINDERS)

    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(
      slots(
        scheduled.filter(({ key }) => key.includes(farId)),
        farId,
      ),
    ).toEqual(['2027-06-01::before', '2027-06-01::due', '2027-06-01::overdue'])
    expect(scheduled.filter(({ body }) => body.includes(RELAY_PIXEL))).toHaveLength(9)
    for (const care of dailies) {
      expect(scheduled).toContainEqual(care.reminders[0])
    }
    expect(scheduled.map(({ at }) => at.getTime())).toEqual(
      scheduled.map(({ at }) => at.getTime()).sort((a, b) => a - b),
    )
  })
})

describe('vaccinationReminderPlan', () => {
  const vaccination = { id: ID, name: 'Typhus, coryza', animalName: 'Pixel', dueDate: '2026-10-05' }

  it('critère 3 : prévenance 2 semaines avant, le jour même et la relance, à l’heure des vaccins', () => {
    const { reminders } = vaccinationReminderPlan(
      t,
      vaccination,
      { ...SETTINGS, vaccineReminderTime: '18:30' },
      new Date(2026, 8, 1, 12),
    )

    expect(reminders).toEqual([
      {
        key: `vaccination:${ID}:2026-10-05::before`,
        title: 'Typhus, coryza de Pixel dans 2 semaines',
        body: 'Le 5 oct. Pense à prendre rendez-vous chez le vétérinaire.',
        at: new Date(2026, 8, 21, 18, 30),
      },
      {
        key: `vaccination:${ID}:2026-10-05::due`,
        title: 'Typhus, coryza de Pixel aujourd’hui',
        body: 'Note le vaccin dans MémoPatte une fois fait.',
        at: new Date(2026, 9, 5, 18, 30),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
      {
        key: `vaccination:${ID}:2026-10-05::overdue`,
        title: 'Typhus, coryza de Pixel en retard de 3 jours',
        body: 'Prends rendez-vous chez le vétérinaire, puis note le vaccin dans MémoPatte.',
        at: new Date(2026, 9, 8, 18, 30),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
    ])
  })

  it('critère 3 : sans « Me prévenir avant l’échéance », pas de prévenance', () => {
    const { reminders } = vaccinationReminderPlan(
      t,
      vaccination,
      { ...SETTINGS, remindBeforeDue: false },
      new Date(2026, 8, 1, 12),
    )

    expect(reminders.map(({ key }) => key.split(':').at(-1))).toEqual(['due', 'overdue'])
  })

  it('sans échéance, aucun rappel ni relais', () => {
    const care = vaccinationReminderPlan(t, { ...vaccination, dueDate: null }, SETTINGS, new Date())

    expect(plannedReminders([care], MAX_SCHEDULED_REMINDERS)).toEqual([])
  })
})

describe('heure locale', () => {
  it.each([
    ['d’été', '2026-03-28', '2026-03-29'],
    ['d’hiver', '2026-10-24', '2026-10-25'],
  ])('passage à l’heure %s : le rappel garde son heure murale', (_, before, after) => {
    const { reminders } = plan({
      input: { firstDueOn: before, times: ['20:00'], endsOn: after },
      reminders: { reminderOffsetMinutes: 60 },
      today: before,
      now: new Date(`${before}T12:00:00`),
    })

    expect(reminders.map(({ at }) => [at.getDate(), at.getHours(), at.getMinutes()])).toEqual([
      [Number(before.slice(8)), 19, 0],
      [Number(after.slice(8)), 19, 0],
    ])
  })

  it('critère 10 : en voyage, le rappel sonne à l’heure locale', () => {
    process.env.TZ = 'America/Toronto'
    const { reminders } = plan({
      input: { firstDueOn: '2026-10-07', times: ['20:00'], endsOn: '2026-10-07' },
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })

    expect(reminders.map(({ at }) => [at.getDate(), at.getHours()])).toEqual([[7, 20]])
    expect(reminders[0]?.at.toISOString()).toBe('2026-10-08T00:00:00.000Z')
  })
})

describe('textes anglais', () => {
  it('rappel du jour, prévenance à plusieurs heures, relance, relais et vaccin', () => {
    i18n.global.locale.value = 'en'
    const care = plan({
      input: {
        firstDueOn: '2026-10-12',
        times: ['08:00', '20:00'],
        frequency: { value: 1, unit: 'week' },
      },
      reminders: HALF_TABLET,
      today: '2026-10-06',
      now: new Date(2026, 9, 6, 12),
    })
    const vaccine = vaccinationReminderPlan(
      t,
      { id: ID, name: 'Typhus, coryza', animalName: 'Pixel', dueDate: '2026-10-05' },
      SETTINGS,
      new Date(2026, 8, 1, 12),
    )

    expect(care.reminders.slice(0, 4).map(({ title, body }) => [title, body])).toEqual([
      [`Pixel’s Panacur in 3 days, at 8${NBSP}am and 8${NBSP}pm`, 'Check you still have a dose.'],
      [`Pixel’s Panacur at 8${NBSP}am`, `½${NBSP}tablet`],
      [`Pixel’s Panacur at 8${NBSP}pm`, `½${NBSP}tablet`],
      ['Pixel’s Panacur is 3 days overdue', 'Remember to give the dose, then log it in MémoPatte.'],
    ])
    expect(care.relay).toBe('To keep getting Pixel’s reminders, open MémoPatte.')
    expect(vaccine.reminders[0]).toMatchObject({
      title: 'Pixel’s Typhus, coryza in 2 weeks',
      body: 'On Oct 5. Remember to book a vet appointment.',
    })
  })
})

describe('parseReminderKey', () => {
  it('relit l’heure d’une clé du plan, sans « : »', () => {
    expect(parseReminderKey(`treatment:${ID}:2026-10-12:0800:before`)).toEqual({
      entry: `treatment:${ID}`,
      dueDate: '2026-10-12',
      dueTime: '08:00',
      moment: 'before',
    })
  })

  it('relit une clé sans heure', () => {
    expect(parseReminderKey(`vaccination:${ID}:2026-10-05::due`)).toEqual({
      entry: `vaccination:${ID}`,
      dueDate: '2026-10-05',
      dueTime: null,
      moment: 'due',
    })
  })

  it('relit l’ancienne forme, restée dans le volet après la mise à jour', () => {
    expect(parseReminderKey(`treatment:${ID}:2026-10-12:overdue`)).toEqual({
      entry: `treatment:${ID}`,
      dueDate: '2026-10-12',
      dueTime: null,
      moment: 'overdue',
    })
  })

  it.each([
    ['une heure illisible', `treatment:${ID}:2026-10-12:8h:due`],
    ['une heure hors de la journée', `treatment:${ID}:2026-10-12:2460:due`],
    ['une clé à rallonge', `treatment:${ID}:2026-10-12:0800:due:2`],
  ])('ne lit pas %s', (_, key) => {
    expect(parseReminderKey(key)).toBeNull()
  })
})

function dayAfter(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + count)
  return date.toISOString().slice(0, 10)
}
