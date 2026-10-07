// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { parseReminderKey } from '@/shared/domain/due-reminders'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import type { TreatmentFrequency } from '../schema/treatment.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import { treatmentReminders } from '../logic/treatment-reminders'
import { dose, missed, period, postponed, shifted, treatment } from './treatment-fixtures'

const t = i18n.global.t
const LUNA = { name: 'Luna', deletedAt: null, unfollowedOn: null }
const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }
const MONTHLY: TreatmentFrequency = { value: 1, unit: 'month' }
const WEEKLY: TreatmentFrequency = { value: 1, unit: 'week' }
const NOW = new Date(2026, 8, 15, 12)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

type Options = { now?: Date; settings?: CarnetReminderSettings }

function remindersOf(
  overrides: Partial<TreatmentPeriodRecord>,
  doses: NewTreatmentDose[] = [],
  { now = NOW, settings = SETTINGS }: Options = {},
) {
  return treatmentReminders(t, treatment([period(overrides)], doses), LUNA, settings, now)
}

/** Espaces insécables remplacées : les attentes s'écrivent au clavier. */
const typed = (text = '') => text.replace(/\s/gu, ' ')

/** `jour heure moment` de chaque rappel programmé, dans l'ordre. */
function slots(
  overrides: Partial<TreatmentPeriodRecord>,
  doses: NewTreatmentDose[] = [],
  options: Options = {},
): string[] {
  return (remindersOf(overrides, doses, options).care?.reminders ?? []).map(({ key }) => {
    const parsed = parseReminderKey(key)!
    return `${parsed.dueDate} ${parsed.dueTime ?? '-'} ${parsed.moment}`
  })
}

describe('treatmentReminders', () => {
  it('quotidien à 8 h et 20 h : un rappel à chaque heure, jamais à 9 h', () => {
    const { care } = remindersOf(
      { startsOn: '2026-09-14', firstDueOn: '2026-09-14', times: ['08:00', '20:00'] },
      [
        dose('2026-09-14', '2026-09-15', { dueTime: '08:00' }),
        dose('2026-09-14', '2026-09-15', { dueTime: '20:00' }),
        dose('2026-09-15', '2026-09-16', { dueTime: '08:00' }),
      ],
    )

    expect(care?.reminders.slice(0, 3).map(({ at, title }) => [at, typed(title)])).toEqual([
      [new Date(2026, 8, 15, 20), 'Métacam de Luna à 20 h'],
      [new Date(2026, 8, 16, 8), 'Métacam de Luna à 8 h'],
      [new Date(2026, 8, 16, 20), 'Métacam de Luna à 20 h'],
    ])
    expect(care?.reminders.every(({ at }) => at.getHours() !== 9)).toBe(true)
  })

  it('sans heure, sonne à l’heure choisie pour le rappel, 9 h par défaut', () => {
    const at = (reminderTime: string | null) =>
      remindersOf({
        firstDueOn: '2026-10-01',
        frequency: MONTHLY,
        reminderTime,
      }).care?.reminders.find(({ key }) => key.endsWith(':due'))?.at

    expect(at(null)).toEqual(new Date(2026, 9, 1, 9))
    expect(at('07:30')).toEqual(new Date(2026, 9, 1, 7, 30))
  })

  it('« 1 h avant » avance le rappel d’une heure', () => {
    const { care } = remindersOf({
      firstDueOn: '2026-09-16',
      times: ['20:00'],
      reminderOffsetMinutes: 60,
    })

    expect(care?.reminders[0]?.at).toEqual(new Date(2026, 8, 16, 19))
  })

  it('aucun rappel après la date de fin', () => {
    expect(slots({ firstDueOn: '2026-09-15', times: ['20:00'], endsOn: '2026-09-17' })).toEqual([
      '2026-09-15 20:00 due',
      '2026-09-16 20:00 due',
      '2026-09-17 20:00 due',
    ])
  })

  it('suit un report : le rappel sonne au jour d’arrivée, plus au jour prévu', () => {
    const keys = slots({ firstDueOn: '2026-09-17', frequency: WEEKLY }, [
      postponed('2026-09-17', '2026-09-19'),
    ])

    expect(keys.filter((slot) => slot.endsWith(' due')).slice(0, 2)).toEqual([
      '2026-09-19 - due',
      '2026-09-24 - due',
    ])
  })

  it('suit une ligne de décalage : la suite repart de sa date d’ancrage', () => {
    const keys = slots({ startsOn: '2026-09-03', firstDueOn: '2026-09-03', frequency: WEEKLY }, [
      dose('2026-09-03', '2026-09-10'),
      dose('2026-09-10', '2026-09-19', { givenOn: '2026-09-12' }),
      shifted('2026-09-10', '2026-09-12'),
    ])

    expect(keys.filter((slot) => slot.endsWith(' due')).slice(0, 2)).toEqual([
      '2026-09-19 - due',
      '2026-09-26 - due',
    ])
  })

  it('ne rappelle plus une échéance déjà donnée', () => {
    const keys = slots({ firstDueOn: '2026-09-16', frequency: MONTHLY }, [
      dose('2026-09-16', '2026-10-16', { givenOn: '2026-09-14' }),
    ])

    expect(keys.some((slot) => slot.startsWith('2026-09-16'))).toBe(false)
    expect(keys).toContain('2026-10-16 - due')
  })

  it('suit « Me prévenir avant l’échéance »', () => {
    const settings = { ...SETTINGS, remindBeforeDue: false }

    expect(slots({ firstDueOn: '2026-10-01', frequency: MONTHLY })).toContain('2026-10-01 - before')
    expect(slots({ firstDueOn: '2026-10-01', frequency: MONTHLY }, [], { settings })).not.toContain(
      '2026-10-01 - before',
    )
  })

  it('aucun rappel pour un traitement arrêté', () => {
    expect(slots({ firstDueOn: '2026-09-16', stoppedOn: '2026-09-15' })).toEqual([])
  })

  it('Q40 : un traitement illisible n’a pas de rappel et ne lève pas', () => {
    const illegible = remindersOf({ firstDueOn: '2026-02-30' })

    expect(illegible.care).toBeNull()
    expect(illegible.isNoted('2026-09-15', null)).toBe(false)
  })

  it('aucun rappel quand l’animal est supprimé ou introuvable', () => {
    const history = treatment([period({ firstDueOn: '2026-09-16' })])
    const deleted = { ...LUNA, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(treatmentReminders(t, history, deleted, SETTINGS, NOW).care).toBeNull()
    expect(treatmentReminders(t, history, null, SETTINGS, NOW).care).toBeNull()
  })

  it('AN-9 : aucun rappel pour un animal qu’on ne suit plus', () => {
    const history = treatment([period({ firstDueOn: '2026-09-16' })])
    const unfollowed = { ...LUNA, unfollowedOn: '2026-09-15' }

    expect(treatmentReminders(t, history, unfollowed, SETTINGS, NOW).care).toBeNull()
  })

  it('traduit les rappels en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(
      typed(remindersOf({ firstDueOn: '2026-09-16', times: ['20:00'] }).care?.reminders[0]?.title),
    ).toBe('Luna’s Métacam at 8 pm')
  })
})

describe('treatmentReminders, échéances notées (RA-19)', () => {
  const { isNoted } = remindersOf(
    { startsOn: '2026-09-13', firstDueOn: '2026-09-13', times: ['08:00', '20:00'] },
    [
      dose('2026-09-13', '2026-09-14', { dueTime: '08:00' }),
      missed('2026-09-13', '2026-09-14', { dueTime: '20:00' }),
      dose('2026-09-14', '2026-09-15', { dueTime: '08:00' }),
      postponed('2026-09-15', '2026-09-16', { dueTime: '08:00' }),
    ],
  )

  it('une échéance donnée ou oubliée est notée, à son heure seulement', () => {
    expect(isNoted('2026-09-13', '08:00')).toBe(true)
    expect(isNoted('2026-09-13', '20:00')).toBe(true)
    expect(isNoted('2026-09-14', '08:00')).toBe(true)
    expect(isNoted('2026-09-14', '20:00')).toBe(false)
  })

  it('une échéance reportée n’est pas notée', () => {
    expect(isNoted('2026-09-15', '08:00')).toBe(false)
  })

  it('B4 : une clé de l’ancienne forme, sans heure, est notée dès qu’une prise de son jour l’est', () => {
    expect(isNoted('2026-09-14', null)).toBe(true)
    expect(isNoted('2026-09-15', null)).toBe(false)
  })
})
