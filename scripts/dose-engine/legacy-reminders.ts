import { DAYS_PER_STEP } from '@/shared/domain/treatment-frequency'
import { treatmentSchedule, uniqueSorted, type Due } from '@/shared/domain/treatment-schedule'
import { treatmentView, viewInputOf, type ReminderWindow } from '@/shared/domain/dose-calendar'

import { isNote, plusDays, type Book } from './carnet'
import { dueKey } from './display'

/**
 * Ce que l'oracle compare : `moment échéance → jour où il sonne`, et les échéances notées ;
 * `inCalendar` : celles que le calendrier v2 contient encore, notées d'après leur état à la fiche.
 */
export type ReminderReading =
  { reminders: string[]; noted: string[]; inCalendar?: string[] } | { error: string }

export const REMINDER_WINDOW: ReminderWindow = { count: 60, daysBefore: 3, daysAfter: 3 }

const line = (moment: string, due: { dueOn: string; dueTime: string | null }, on: string) =>
  `${moment} ${dueKey(due)} → ${on}`

// RA-19 : les échéances des lignes du carnet que chaque lecture tient pour notées.
function notedKeys(book: Book, isNoted: (day: string, time: string | null) => boolean): string[] {
  const keys = new Map(book.doses.map((dose) => [dueKey(dose), dose]))
  return [...keys]
    .filter(([, { dueOn, dueTime }]) => isNoted(dueOn, dueTime))
    .map(([key]) => key)
    .sort()
}

/** Les rappels tels que l'app les programmait avant le pas 8 : l'ancien moteur, et ses règles recopiées. */
export function legacyReminders(book: Book): ReminderReading {
  let schedule
  try {
    schedule = treatmentSchedule(book)
  } catch (error) {
    return { error: String(error) }
  }
  const notes = book.doses.filter(isNote)
  const noted = notedKeys(book, (day, time) =>
    notes.some((note) => note.dueOn === day && (time === null || note.dueTime === time)),
  )
  const period = book.periods.find(({ id }) => id === schedule.currentPeriodId)
  if (period === undefined) return { reminders: [], noted }
  const { count, daysBefore, daysAfter } = REMINDER_WINDOW
  const perDay = Math.max(1, period.times.length)
  const lastDay = schedule.phase === 'ended' ? schedule.lastDueDay() : null
  const dues = uniqueSorted([
    ...schedule.unloggedDoses.filter(({ dueOn }) => dueOn === lastDay),
    ...schedule.currentDoses,
    ...schedule.upcoming(count + 2 * perDay + 1),
  ])
  const days = new Map<string, Due[]>()
  for (const due of dues) days.set(due.dueOn, [...(days.get(due.dueOn) ?? []), due])
  const dayList = [...days.keys()]
  const spans = period.frequency.value * DAYS_PER_STEP[period.frequency.unit] > daysBefore
  const reminders: string[] = []
  dayList.forEach((day, index) => {
    const ofDay = days.get(day)!
    for (const due of ofDay) reminders.push(line('due', due, day))
    if (!spans) return
    const before = plusDays(day, -daysBefore)
    const previous = dayList[index - 1]
    if (previous === undefined || before > previous)
      reminders.push(line('before', ofDay[0]!, before))
    const overdue = plusDays(day, daysAfter)
    const next = dayList[index + 1]
    const nothingNoted = period.times.every((time) => ofDay.some((due) => due.dueTime === time))
    if (nothingNoted && (next === undefined || overdue < next)) {
      reminders.push(line('overdue', ofDay[0]!, overdue))
    }
  })
  return { reminders, noted }
}

/** Les rappels de la vue v2 sur le même carnet, par le même adaptateur que l'oracle. */
export function viewReminders(book: Book): ReminderReading {
  try {
    const view = treatmentView(viewInputOf(book))
    const reminders = view
      .reminders(REMINDER_WINDOW)
      .map(({ moment, due, on }) => line(moment, due, on))
    const noted = notedKeys(book, view.isNoted)
    const inCalendar = notedKeys(book, (day, time) =>
      view.slots(day, day).some(({ due }) => time === null || due.dueTime === time),
    )
    return { reminders, noted, inCalendar }
  } catch (error) {
    return { error: String(error) }
  }
}

/** Relances en plus de la vue sur une journée montrée avec moins d'heures que le réglage ; `null` s'il y a une autre différence. */
export function shortDayRelances(
  book: Book,
  old: ReminderReading,
  now: ReminderReading,
): string[] | null {
  if ('error' in old || 'error' in now) return null
  if (old.reminders.some((line) => !now.reminders.includes(line))) return null
  const extra = now.reminders.filter((line) => !old.reminders.includes(line))
  const view = treatmentView(viewInputOf(book))
  const shortDay = (line: string) => {
    const [moment, key] = line.split(' ')
    const day = key!.slice(0, 10)
    const setting = view.settingAt(day) ?? view.currentSetting
    const shown = view.slots(day, day)
    return (
      moment === 'overdue' &&
      setting !== null &&
      shown.length < Math.max(1, setting.times.length) &&
      shown.every(({ state }) => state === 'pending')
    )
  }
  return extra.length > 0 && extra.every(shortDay) ? extra : null
}
