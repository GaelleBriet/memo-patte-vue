import {
  treatmentView,
  type ReminderReading,
  type ReminderWindow,
  type TreatmentView,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import { parseReminderKey } from '@/shared/domain/due-reminders'
import {
  DEFAULT_REMINDER_TIME,
  treatmentReminderPlan,
  type TreatmentReminderPeriod,
} from '@/shared/domain/reminder-plan'

import { plusDays } from './carnet'
import { dueKey } from './display'
import type { Broken } from './v2-reading'
import { REMINDER_WINDOW } from './v2-reminders'

/** Les heures où la campagne ouvre l'app : au tout début et à la toute fin de la journée. */
export const OPENING_TIMES = ['00:00', '23:59'] as const

/** Écarts « À l'heure » et « 1 h avant » (RA-7) ; heures d'un traitement sans heure (RA-8). */
export const REMINDER_OFFSETS = [0, 60] as const
export const REMINDER_TIMES = ['07:00', DEFAULT_REMINDER_TIME, '21:00'] as const

const SETTINGS = { vaccineReminderTime: DEFAULT_REMINDER_TIME, remindBeforeDue: true }

type Due = { dueOn: string; dueTime: string | null }

function localInstant(day: string, time: string, minutesBefore = 0): Date {
  const date = new Date(`${day}T${time}:00`)
  date.setMinutes(date.getMinutes() - minutesBefore)
  return date
}

function onceRead(view: TreatmentView): Pick<TreatmentView, 'reminders'> {
  const read = new Map<string, ReminderReading>()
  return {
    reminders: (window: ReminderWindow) => {
      const key = JSON.stringify(window)
      if (!read.has(key)) read.set(key, view.reminders(window))
      return read.get(key)!
    },
  }
}

function brokenIn(
  view: TreatmentView,
  reminders: Pick<TreatmentView, 'reminders'>,
  today: string,
  now: Date,
  period: TreatmentReminderPeriod,
): Broken | null {
  const care = treatmentReminderPlan(
    (key) => key,
    { id: 'campagne', name: 'Panacur', animalName: 'Pixel', period, view: reminders },
    SETTINGS,
    now,
  )
  const programmed = care.reminders.flatMap(({ key, at }) => {
    const parsed = parseReminderKey(key)
    return parsed?.moment === 'due'
      ? [{ key: dueKey({ dueOn: parsed.dueDate, dueTime: parsed.dueTime }), at }]
      : []
  })
  if (programmed.length === 0) return null
  const readAll = reminders.reminders(REMINDER_WINDOW).readAll
  const last = programmed.at(-1)!
  const keys = new Set(programmed.map(({ key }) => key))
  const unlogged = new Set(view.unloggedDoses.map(dueKey))
  const lastDay = last.key.slice(0, 10)
  const ringsAt = ({ dueOn, dueTime }: Due) =>
    dueTime === null
      ? localInstant(dueOn, period.reminderTime ?? DEFAULT_REMINDER_TIME)
      : localInstant(dueOn, dueTime, period.reminderOffsetMinutes ?? 0)
  const later = (due: Due) => !unlogged.has(dueKey(due)) && ringsAt(due) > now
  const missing = view
    .upcoming({ from: today, to: plusDays(lastDay, 1) })
    .filter((due) => later(due) && ringsAt(due) <= last.at)
    .filter((due) => !keys.has(dueKey(due)))
    .map(dueKey)
  const after = view
    .upcoming({ from: lastDay, to: plusDays(lastDay, 3000), limit: 50 })
    .filter((due) => later(due) && ringsAt(due) > last.at)
    .map(dueKey)
  const completeUnread = care.complete && !readAll
  if (missing.length === 0 && !completeUnread && (!care.complete || after.length === 0)) return null
  return {
    invariant: `rappel ${period.reminderOffsetMinutes} min avant, sans heure à ${period.reminderTime}`,
    detail: JSON.stringify({
      manquantes: missing.slice(0, 6),
      complet: care.complete,
      toutLu: readAll,
      apres: after.slice(0, 6),
      dernier: last.key,
    }).slice(0, 900),
  }
}

/** RA-1, RA-11, RA-12 dans le plan de l'app ouverte à `time` : rien ne manque avant le dernier rappel ; sans relais, plus rien après. */
export function planBrokenBy(input: TreatmentViewInput, time: string): Broken | null {
  const view = treatmentView(input)
  if (view.phase === 'stopped' || view.phase === 'ended') return null
  const now = localInstant(input.today, time)
  const reminders = onceRead(view)
  for (const reminderOffsetMinutes of REMINDER_OFFSETS) {
    for (const reminderTime of REMINDER_TIMES) {
      const period = { reminderOffsetMinutes, reminderTime, doseQuantity: null, doseUnit: null }
      const broken = brokenIn(view, reminders, input.today, now, period)
      if (broken !== null) {
        return {
          ...broken,
          invariant: `plan des rappels à ${time}, ${broken.invariant} (RA-1, RA-11, RA-12)`,
        }
      }
    }
  }
  return null
}
