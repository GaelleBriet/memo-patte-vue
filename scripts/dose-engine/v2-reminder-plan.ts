import { treatmentView, type TreatmentViewInput } from '@/shared/domain/dose-calendar'
import { parseReminderKey } from '@/shared/domain/due-reminders'
import { DEFAULT_REMINDER_TIME, treatmentReminderPlan } from '@/shared/domain/reminder-plan'

import { plusDays } from './carnet'
import { dueKey } from './display'
import type { Broken } from './v2-reading'

/** Les heures où la campagne ouvre l'app : au tout début et à la toute fin de la journée. */
export const OPENING_TIMES = ['00:00', '23:59'] as const

const SETTINGS = { vaccineReminderTime: DEFAULT_REMINDER_TIME, remindBeforeDue: true }
const PERIOD = {
  reminderOffsetMinutes: null,
  reminderTime: null,
  doseQuantity: null,
  doseUnit: null,
}

const localInstant = (day: string, time: string | null) =>
  new Date(`${day}T${time ?? DEFAULT_REMINDER_TIME}:00`)

/**
 * RA-1, RA-11, RA-12 lus dans le plan de l'app ouverte à `time` : aucune échéance de la fiche ne
 * manque entre maintenant et le dernier rappel programmé ; sans relais, plus rien ne reste après.
 */
export function planBrokenBy(input: TreatmentViewInput, time: string): Broken | null {
  const view = treatmentView(input)
  if (view.phase === 'stopped' || view.phase === 'ended') return null
  const now = localInstant(input.today, time)
  const care = treatmentReminderPlan(
    (key) => key,
    { id: 'campagne', name: 'Panacur', animalName: 'Pixel', period: PERIOD, view },
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
  const last = programmed.at(-1)!
  const keys = new Set(programmed.map(({ key }) => key))
  const unlogged = new Set(view.unloggedDoses.map(dueKey))
  const lastDay = last.key.slice(0, 10)
  const later = (due: { dueOn: string; dueTime: string | null }) =>
    !unlogged.has(dueKey(due)) && localInstant(due.dueOn, due.dueTime) > now
  const missing = view
    .upcoming({ from: input.today, to: lastDay })
    .filter((due) => later(due) && localInstant(due.dueOn, due.dueTime) <= last.at)
    .filter((due) => !keys.has(dueKey(due)))
    .map(dueKey)
  const after = view
    .upcoming({ from: lastDay, to: plusDays(lastDay, 3000), limit: 50 })
    .filter((due) => later(due) && localInstant(due.dueOn, due.dueTime) > last.at)
    .map(dueKey)
  if (missing.length === 0 && (!care.complete || after.length === 0)) return null
  return {
    invariant: `plan des rappels à ${time} (RA-1, RA-11, RA-12)`,
    detail: JSON.stringify({
      manquantes: missing.slice(0, 6),
      complet: care.complete,
      apres: after.slice(0, 6),
      dernier: last.key,
    }).slice(0, 900),
  }
}
