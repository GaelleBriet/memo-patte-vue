import {
  treatmentView,
  type ReminderWindow,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { dueKey } from './display'
import type { Broken } from './v2-reading'

export const REMINDER_WINDOW: ReminderWindow = { count: 60, daysBefore: 3, daysAfter: 3 }
const STEP_DAYS = { day: 1, week: 7, month: 28 } as const

const broken = (rule: string, detail: unknown): Broken => ({
  invariant: `rappels (${rule})`,
  detail: JSON.stringify(detail).slice(0, 900),
})

/**
 * Les rappels programmés sont les échéances que montre la fiche (RA-1, RA-6) : de la première à la
 * dernière rappelée, toute échéance à donner a son rappel du jour, aucune autre ; prévenance et
 * relance selon RA-2 à RA-5, relues sur l'état de chaque échéance ; RA-19 sur chaque ligne.
 */
export function remindersBrokenBy(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const reminders = view.reminders(REMINDER_WINDOW)
  const closed = view.phase === 'stopped' || view.phase === 'ended'
  const unlogged = new Set(view.unloggedDoses.map(dueKey))
  const lastDay = view.phase === 'ended' ? view.lastDueDay : null
  const afterEnd = view.unloggedDoses.filter(({ dueOn }) => dueOn === lastDay).map(dueKey)

  const dues = reminders.filter(({ moment }) => moment === 'due').map(({ due }) => due)
  const reminded = dues.map(dueKey)
  if (new Set(reminded).size !== reminded.length) return broken('un rappel par échéance', reminded)
  if (closed) {
    const extra = reminded.filter((key) => !afterEnd.includes(key))
    if (extra.length > 0 || reminded.length !== afterEnd.length) {
      return broken('RA-6, fini ou arrêté', { reminded, afterEnd })
    }
  } else {
    const current = view.currentDoses.map(dueKey)
    if (current.some((key) => !reminded.includes(key))) {
      return broken('RA-1, dose du moment', { current, reminded })
    }
    const toGive = dues.length === 0 ? [] : view.slots(dues[0]!.dueOn, dues.at(-1)!.dueOn)
    const shown = toGive
      .filter(({ due, state }) => state === 'pending' && !unlogged.has(dueKey(due)))
      .map(({ due }) => dueKey(due))
    // RA-1, RA-11 : la dernière journée lue est entière, le plan trie ensuite à l'heure (#929, #933).
    if (JSON.stringify(shown) !== JSON.stringify(reminded)) {
      return broken('RA-1, RA-6, échéances de la fiche', {
        fiche: shown.filter((key) => !reminded.includes(key)),
        rappels: reminded.filter((key) => !shown.includes(key)),
        phase: view.phase,
        current: view.currentDoses.map(dueKey),
      })
    }
    const wanted = Math.min(
      REMINDER_WINDOW.count,
      view.upcoming({ to: plusDays(input.today, 3000) }).length,
    )
    if (reminded.length < wanted) return broken('RA-11, assez d’échéances', { wanted, reminded })
  }

  const days = [...new Set(dues.map(({ dueOn }) => dueOn))]
  const expected: string[] = []
  const hours: Record<string, string[]> = {}
  days.forEach((day, index) => {
    const setting = view.settingAt(day) ?? view.currentSetting!
    const { value, unit } = setting.frequency
    if (value * STEP_DAYS[unit] <= REMINDER_WINDOW.daysBefore) return
    const ofDay = dues.filter(({ dueOn }) => dueOn === day)
    const first = dueKey(ofDay[0]!)
    const before = plusDays(day, -REMINDER_WINDOW.daysBefore)
    if (index === 0 || before > days[index - 1]!) expected.push(`before ${first} → ${before}`)
    hours[first] = ofDay.flatMap(({ dueTime }) => (dueTime === null ? [] : [dueTime]))
    const overdue = plusDays(day, REMINDER_WINDOW.daysAfter)
    const allPending = view.slots(day, day).every(({ state }) => state === 'pending')
    const beforeNext = index === days.length - 1 || overdue < days[index + 1]!
    if (allPending && beforeNext) expected.push(`overdue ${first} → ${overdue}`)
  })
  const got = reminders.filter(({ moment }) => moment !== 'due')
  const gotLines = got.map(({ moment, due, on }) => `${moment} ${dueKey(due)} → ${on}`)
  if (JSON.stringify(gotLines.sort()) !== JSON.stringify(expected.sort())) {
    return broken('RA-2 à RA-5, prévenance et relance', {
      attendus: expected.filter((each) => !gotLines.includes(each)),
      rappels: gotLines.filter((each) => !expected.includes(each)),
    })
  }
  const wrongHours = got.filter(
    ({ moment, due, hours: shown }) =>
      moment === 'before' && JSON.stringify(shown) !== JSON.stringify(hours[dueKey(due)]),
  )
  if (wrongHours.length > 0) return broken('RA-5, heures de la prévenance', wrongHours)

  for (const line of input.lines) {
    const matches = (hour: string | null) => line.dueTime === null || hour === line.dueTime
    const ofDay = view.slots(line.dueOn, line.dueOn).filter(({ due }) => matches(due.dueTime))
    const noted =
      ofDay.length === 0
        ? input.lines.some(
            (other) =>
              (other.status === 'given' || other.status === 'missed') &&
              other.dueOn === line.dueOn &&
              matches(other.dueTime),
          )
        : ofDay.some(({ due }) => ['given', 'missed', 'covered'].includes(view.dueState(due)))
    if (view.isNoted(line.dueOn, line.dueTime) !== noted) {
      return broken('RA-19, échéance notée', { line, noted })
    }
  }
  return null
}
