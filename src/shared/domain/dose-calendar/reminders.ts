import { hoursOf, keyOf, longestStep, plusDays } from './grid'
import type { Day, Due, Phase, Setting } from './types'

export type ReminderMoment = 'before' | 'due' | 'overdue'

/** Un rappel : l'échéance qu'il vise, le jour où il sonne, les heures encore dues de ce jour. */
export type DueReminder = { moment: ReminderMoment; due: Due; on: Day; hours: string[] }

/** `count` : rappels voulus ; `daysBefore`, `daysAfter` : prévenance et relance (RA-2, RA-3). */
export type ReminderWindow = { count: number; daysBefore: number; daysAfter: number }

/** Ce que les rappels lisent de la vue. */
export type ReminderSource = {
  phase: Phase
  lastDueDay: Day | null
  currentDoses: Due[]
  unloggedDoses: Due[]
  currentSetting: Setting | null
  upcomingUntil(limit: number): Due[]
  settingAt(day: Day): Setting | undefined
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

// Les heures en trop rattrapent les échéances déjà passées d'une journée, que le plan écarte.
function remindedDues(source: ReminderSource, count: number): Due[] {
  const perDay = Math.max(1, source.currentSetting?.times.length ?? 0)
  const upcoming = source.upcomingUntil(count + 2 * perDay + 1)
  return uniqueSorted([...lastDoseAfterEnd(source), ...source.currentDoses, ...upcoming])
}

function byDay(dues: readonly Due[]): Map<Day, Due[]> {
  const days = new Map<Day, Due[]>()
  for (const due of dues) days.set(due.dueOn, [...(days.get(due.dueOn) ?? []), due])
  return days
}

/**
 * RA-1 à RA-6 : un rappel par échéance encore à donner ; au-delà de `daysBefore` jours de rythme, la
 * prévenance et la relance, à la première heure du jour (RA-5), tant qu'elles ne tombent pas sur
 * l'échéance voisine (RA-4) ; la relance seulement si toutes les heures du jour sont encore dues.
 */
export function dueReminders(source: ReminderSource, window: ReminderWindow): DueReminder[] {
  if (source.currentSetting === null) return []
  const { daysBefore, daysAfter } = window
  const days = byDay(remindedDues(source, window.count))
  const dayList = [...days.keys()]
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
    const allDue = hoursOf(setting.times).every((hour) => dues.some((due) => due.dueTime === hour))
    if (allDue && (next === undefined || overdue < next)) {
      all.push({ moment: 'overdue', due: first!, on: overdue, hours })
    }
  })
  return all
}
