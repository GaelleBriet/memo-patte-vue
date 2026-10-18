import { keyOf, longestStep, plusDays } from './grid'
import type { Day, Due, Phase, Setting } from './types'

export type ReminderMoment = 'before' | 'due' | 'overdue'

/** Un rappel : l'échéance qu'il vise, le jour où il sonne, les heures encore dues de ce jour. */
export type DueReminder = { moment: ReminderMoment; due: Due; on: Day; hours: string[] }

/** `count` : rappels voulus ; `daysBefore`, `daysAfter` : prévenance et relance (RA-2, RA-3). */
export type ReminderWindow = { count: number; daysBefore: number; daysAfter: number }

/** Les rappels lus ; `readAll` : aucune échéance à donner ne reste après la dernière journée lue. */
export type ReminderReading = { reminders: DueReminder[]; readAll: boolean }

/** Ce que les rappels lisent de la vue. */
type ReminderSource = {
  phase: Phase
  lastDueDay: Day | null
  currentDoses: Due[]
  unloggedDoses: Due[]
  currentSetting: Setting | null
  upcomingUntil(limit: number): Due[]
  /** Les échéances encore à donner de ce jour, toutes. */
  pendingOn(day: Day): Due[]
  /** Vrai : une échéance reste à donner après ce jour. */
  pendingAfter(day: Day): boolean
  settingAt(day: Day): Setting | undefined
  /** Les échéances que la fiche montre de `from` à `to`, notées ou non. */
  calendarDues(from: Day, to: Day): Due[]
}

const byKey = (a: Due, b: Due) => keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime))

function uniqueSorted(dues: readonly Due[]): Due[] {
  const byDue = new Map(dues.map((due) => [keyOf(due.dueOn, due.dueTime), due]))
  return [...byDue.values()].sort(byKey)
}

// RA-6 : une fois la date de fin passée, la dernière dose garde sa relance, prévue avant la fin.
function lastDoseAfterEnd({ phase, lastDueDay, unloggedDoses }: ReminderSource): Due[] {
  if (phase !== 'ended') return []
  return unloggedDoses.filter(({ dueOn }) => dueOn === lastDueDay)
}

// La marge couvre les échéances déjà passées du premier jour lu, que le plan écarte, pour lui en
// laisser `count` (RA-11). La dernière journée lue est entière : `readAll` dit ce qui reste après.
function remindedDues(source: ReminderSource, count: number): { dues: Due[]; readAll: boolean } {
  const perDay = Math.max(1, source.currentSetting?.times.length ?? 0)
  const first = source.upcomingUntil(count + 2 * perDay + 1)
  const firstDay = first[0]?.dueOn
  const sameDay = firstDay === undefined ? 0 : source.pendingOn(firstDay).length
  const upcoming = sameDay > perDay ? source.upcomingUntil(count + 2 * sameDay + 1) : first
  const lastDay = upcoming.at(-1)?.dueOn
  const wholeLastDay = lastDay === undefined ? [] : source.pendingOn(lastDay)
  const dues = uniqueSorted([
    ...lastDoseAfterEnd(source),
    ...source.currentDoses,
    ...upcoming,
    ...wholeLastDay,
  ])
  return { dues, readAll: lastDay === undefined || !source.pendingAfter(lastDay) }
}

function byDay(dues: readonly Due[]): Map<Day, Due[]> {
  const days = new Map<Day, Due[]>()
  for (const due of dues) days.set(due.dueOn, [...(days.get(due.dueOn) ?? []), due])
  return days
}

/**
 * RA-1 à RA-6 : un rappel par échéance encore à donner ; au-delà de `daysBefore` jours de rythme, la
 * prévenance et la relance, à la première heure du jour (RA-5), tant qu'elles ne tombent pas sur
 * l'échéance voisine (RA-4) ; la relance seulement si toutes les heures que la fiche montre ce jour-là
 * sont encore dues.
 */
export function dueReminders(source: ReminderSource, window: ReminderWindow): ReminderReading {
  if (source.currentSetting === null) return { reminders: [], readAll: true }
  const { daysBefore, daysAfter } = window
  const { dues: reminded, readAll } = remindedDues(source, window.count)
  const days = byDay(reminded)
  const dayList = [...days.keys()]
  const shownDays =
    dayList.length === 0
      ? new Map<Day, Due[]>()
      : byDay(source.calendarDues(dayList[0]!, dayList.at(-1)!))
  const all: DueReminder[] = []

  dayList.forEach((day, index) => {
    const dues = days.get(day)!
    const hours = dues.flatMap(({ dueTime }) => (dueTime === null ? [] : [dueTime]))
    for (const due of dues) all.push({ moment: 'due', due, on: day, hours })
    const setting = source.settingAt(day) ?? source.currentSetting!
    if (longestStep(setting.frequency) <= daysBefore) return

    const [first] = dues
    const before = plusDays(day, -daysBefore)
    const previous = dayList[index - 1]
    if (previous === undefined || before > previous) {
      all.push({ moment: 'before', due: first!, on: before, hours })
    }
    const overdue = plusDays(day, daysAfter)
    const next = dayList[index + 1]
    const allDue = (shownDays.get(day) ?? []).every((shown) =>
      dues.some((due) => due.dueTime === shown.dueTime),
    )
    if (allDue && (next === undefined || overdue < next)) {
      all.push({ moment: 'overdue', due: first!, on: overdue, hours })
    }
  })
  return { reminders: all, readAll }
}
