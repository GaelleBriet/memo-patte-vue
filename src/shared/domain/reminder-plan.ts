import { addDays, compareAsc, format } from 'date-fns'

import { REMINDER_DONE_ACTION_TYPE, type Reminder } from '@/core/notifications'
import {
  formatClockTime,
  formatClockTimes,
  formatDayMonthOrYear,
  withoutFinalDot,
} from '@/shared/utils/format'
import { dosageText, type Dosage } from './dosage'
import {
  DAYS_BEFORE_DUE,
  DAYS_OVERDUE,
  dueReminderKey,
  parseReminderKey,
  type DueReminderEntry,
  type DueReminderMoment,
} from './due-reminders'
import { toDate } from './calendar-day'
import { DAYS_PER_STEP } from './treatment-frequency'
import {
  uniqueSorted,
  type Due,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from './treatment-schedule'

export type ReminderTranslate = (
  key: string,
  named: Record<string, unknown>,
  plural?: number,
) => string

export type CarnetReminderSettings = { vaccineReminderTime: string; remindBeforeDue: boolean }

export type TreatmentReminderPeriod = Pick<TreatmentPeriodInput, 'frequency' | 'times' | 'endsOn'> &
  Dosage & { reminderOffsetMinutes: number | null; reminderTime: string | null }

export type TreatmentReminderSource = {
  id: string
  name: string
  animalName: string
  period: TreatmentReminderPeriod
  schedule: Pick<
    TreatmentSchedule,
    'phase' | 'currentDoses' | 'unloggedDoses' | 'upcoming' | 'lastDueDay'
  >
}

export type VaccinationReminderSource = {
  id: string
  name: string
  animalName: string
  dueDate: string | null
}

/** Les rappels d'un soin, triés ; `complete` : rien de ce qui reste à venir n'en est exclu. */
export type CareReminders = {
  entry: DueReminderEntry
  reminders: Reminder[]
  complete: boolean
  relay: string
}

/** Provisoire : la valeur se fixe à la mesure sur le téléphone (#538). */
export const MAX_REMINDERS_PER_CARE = 60

export const DEFAULT_REMINDER_TIME = '09:00'
export const DEFAULT_CARNET_REMINDER_SETTINGS: CarnetReminderSettings = {
  vaccineReminderTime: DEFAULT_REMINDER_TIME,
  remindBeforeDue: true,
}
export const DAYS_BEFORE_VACCINATION = 14

const WITH_DONE_ACTION: ReadonlySet<DueReminderMoment> = new Set(['due', 'overdue'])

function shiftDay(day: string, days: number): string {
  return format(addDays(toDate(day), days), 'yyyy-MM-dd')
}

/** Heure murale du jour, moins le décalage : l'instant suit le fuseau du téléphone. */
function instant(day: string, time: string, minutesBefore = 0): Date {
  const date = toDate(day)
  date.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)) - minutesBefore)
  return date
}

function reminder(
  entry: DueReminderEntry,
  due: { day: string; time: string | null },
  moment: DueReminderMoment,
  at: Date,
  texts: { title: string; body: string },
): Reminder {
  return {
    key: dueReminderKey(entry, due.day, due.time, moment),
    ...texts,
    at,
    ...(WITH_DONE_ACTION.has(moment) ? { actionTypeId: REMINDER_DONE_ACTION_TYPE } : {}),
  }
}

function byDay(dues: readonly Due[]): Map<string, Due[]> {
  const days = new Map<string, Due[]>()
  for (const due of dues) days.set(due.dueOn, [...(days.get(due.dueOn) ?? []), due])
  return days
}

/** Une fois la date de fin passée, la dernière dose garde sa relance : elle était prévue avant la fin. */
function lastDoseAfterEnd({ schedule }: TreatmentReminderSource): Due[] {
  if (schedule.phase !== 'ended') return []
  const lastDay = schedule.lastDueDay()
  return schedule.unloggedDoses.filter(({ dueOn }) => dueOn === lastDay)
}

function upcomingAndCurrent(source: TreatmentReminderSource): Due[] {
  const { period, schedule } = source
  const perDay = Math.max(1, period.times.length)
  const fetched = schedule.upcoming(MAX_REMINDERS_PER_CARE + 2 * perDay + 1)
  return uniqueSorted([...lastDoseAfterEnd(source), ...schedule.currentDoses, ...fetched])
}

export function treatmentReminderPlan(
  t: ReminderTranslate,
  source: TreatmentReminderSource,
  settings: CarnetReminderSettings,
  now: Date,
): CareReminders {
  const { id, name, animalName, period } = source
  const entry: DueReminderEntry = { kind: 'treatment', id }
  const named = { name, animal: animalName }
  const offset = period.reminderOffsetMinutes ?? 0
  const atOf = (day: string, time: string | null) =>
    time === null
      ? instant(day, period.reminderTime ?? DEFAULT_REMINDER_TIME)
      : instant(day, time, offset)
  const { value, unit } = period.frequency
  const spansAllowed = value * DAYS_PER_STEP[unit] > DAYS_BEFORE_DUE
  const dosage = dosageText(t, period) ?? ''
  const days = byDay(upcomingAndCurrent(source))
  const dayList = [...days.keys()]
  const all: Reminder[] = []

  dayList.forEach((day, index) => {
    const dues = days.get(day)!
    for (const { dueTime } of dues) {
      const title =
        dueTime === null
          ? t('reminders.plan.treatment.dueToday', named)
          : t('reminders.plan.treatment.dueAt', { ...named, time: formatClockTime(dueTime) })
      all.push(
        reminder(entry, { day, time: dueTime }, 'due', atOf(day, dueTime), { title, body: dosage }),
      )
    }
    if (!spansAllowed) return

    const first = { day, time: dues[0]!.dueTime }
    const before = shiftDay(day, -DAYS_BEFORE_DUE)
    const previous = dayList[index - 1]
    if (settings.remindBeforeDue && (previous === undefined || before > previous)) {
      const times = dues.flatMap(({ dueTime }) => (dueTime === null ? [] : [dueTime]))
      const title =
        times.length === 0
          ? t('reminders.plan.treatment.before', { ...named, days: DAYS_BEFORE_DUE })
          : t('reminders.plan.treatment.beforeAt', {
              ...named,
              days: DAYS_BEFORE_DUE,
              times: formatClockTimes(times),
            })
      const body = t('reminders.plan.treatment.beforeBody', {})
      all.push(reminder(entry, first, 'before', atOf(before, first.time), { title, body }))
    }

    const overdue = shiftDay(day, DAYS_OVERDUE)
    const next = dayList[index + 1]
    const nothingNoted = period.times.every((time) => dues.some((due) => due.dueTime === time))
    if (nothingNoted && (next === undefined || overdue < next)) {
      all.push(
        reminder(entry, first, 'overdue', atOf(overdue, first.time), {
          title: t('reminders.plan.treatment.overdueTitle', { ...named, days: DAYS_OVERDUE }),
          body: t('reminders.plan.treatment.overdueBody', {}),
        }),
      )
    }
  })

  const future = all
    .filter(({ at }) => at > now)
    .sort((a, b) => compareAsc(a.at, b.at) || a.key.localeCompare(b.key))
  return {
    entry,
    reminders: future.slice(0, MAX_REMINDERS_PER_CARE),
    complete: future.length <= MAX_REMINDERS_PER_CARE,
    relay: t('reminders.plan.relay', { animal: animalName }),
  }
}

export function vaccinationReminderPlan(
  t: ReminderTranslate,
  { id, name, animalName, dueDate }: VaccinationReminderSource,
  settings: CarnetReminderSettings,
  now: Date,
): CareReminders {
  const entry: DueReminderEntry = { kind: 'vaccination', id }
  const relay = t('reminders.plan.relay', { animal: animalName })
  if (dueDate === null) return { entry, reminders: [], complete: true, relay }

  const named = { name, animal: animalName }
  const due = { day: dueDate, time: null }
  const atOf = (days: number) => instant(shiftDay(dueDate, days), settings.vaccineReminderTime)
  const date = withoutFinalDot(formatDayMonthOrYear(dueDate, format(now, 'yyyy-MM-dd')))
  const before = settings.remindBeforeDue
    ? [
        reminder(entry, due, 'before', atOf(-DAYS_BEFORE_VACCINATION), {
          title: t('reminders.plan.vaccination.beforeTitle', {
            ...named,
            weeks: DAYS_BEFORE_VACCINATION / 7,
          }),
          body: t('reminders.plan.vaccination.beforeBody', { date }),
        }),
      ]
    : []
  const reminders = [
    ...before,
    reminder(entry, due, 'due', atOf(0), {
      title: t('reminders.plan.vaccination.dueTitle', named),
      body: t('reminders.plan.vaccination.dueBody', {}),
    }),
    reminder(entry, due, 'overdue', atOf(DAYS_OVERDUE), {
      title: t('reminders.plan.vaccination.overdueTitle', { ...named, days: DAYS_OVERDUE }),
      body: t('reminders.plan.vaccination.overdueBody', {}),
    }),
  ].filter(({ at }) => at > now)

  return { entry, reminders, complete: true, relay }
}

const FIRST_DUE = 0
const FIRST_SPAN = 1
const LATER = 2

function dueSlot({ dueDate, dueTime }: { dueDate: string; dueTime: string | null }): string {
  return `${dueDate} ${dueTime ?? ''}`
}

/** Échéance à venir la plus proche de chaque entrée, jour et heure, d'après les rappels du jour même. */
function firstUpcomingByEntry(reminders: Reminder[]): Map<string, string> {
  const first = new Map<string, string>()

  for (const { key } of reminders) {
    const parsed = parseReminderKey(key)
    if (parsed === null || parsed.moment !== 'due') continue
    const known = first.get(parsed.entry)
    if (known === undefined || dueSlot(parsed) < known) first.set(parsed.entry, dueSlot(parsed))
  }

  return first
}

/** Prévenance et relance comptent avec la première échéance quand elles visent son jour. */
function rankOf(reminder: Reminder, first: Map<string, string>): number {
  const parsed = parseReminderKey(reminder.key)
  const slot = parsed === null ? undefined : first.get(parsed.entry)
  if (parsed === null || slot === undefined) return LATER
  if (parsed.moment === 'due') return slot === dueSlot(parsed) ? FIRST_DUE : LATER

  return slot.startsWith(`${parsed.dueDate} `) ? FIRST_SPAN : LATER
}

/**
 * Rappels tenant sous le plafond, triés dans le temps : la première échéance à venir de chaque
 * entrée passe avant le reste, si lointaine soit-elle, puis les plus proches remplissent la place.
 */
export function remindersWithinCap(reminders: Reminder[], limit: number): Reminder[] {
  const byDate = [...reminders].sort((a, b) => compareAsc(a.at, b.at))
  const max = Math.max(limit, 0)
  if (byDate.length <= max) return byDate

  const first = firstUpcomingByEntry(byDate)

  return byDate
    .map((reminder, order) => ({ reminder, order, rank: rankOf(reminder, first) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, max)
    .sort((a, b) => a.order - b.order)
    .map(({ reminder }) => reminder)
}

function withRelay(reminder: Reminder, relay: string): Reminder {
  return { ...reminder, body: reminder.body === '' ? relay : `${reminder.body}\n${relay}` }
}

/**
 * Les rappels à programmer sous `limit`, triés dans le temps : la prochaine échéance de chaque soin
 * d'abord, puis les plus proches ; le dernier rappel gardé d'un soin coupé porte le relais.
 */
export function plannedReminders(cares: readonly CareReminders[], limit: number): Reminder[] {
  const kept = remindersWithinCap(
    cares.flatMap(({ reminders }) => reminders),
    limit,
  )
  const keptKeys = new Set(kept.map(({ key }) => key))
  const relays = new Map<string, string>()

  for (const { reminders, complete, relay } of cares) {
    const ofCare = reminders.filter(({ key }) => keptKeys.has(key))
    const last = ofCare.at(-1)
    if (last !== undefined && (!complete || ofCare.length < reminders.length)) {
      relays.set(last.key, relay)
    }
  }

  return kept.map((reminder) => {
    const relay = relays.get(reminder.key)
    return relay === undefined ? reminder : withRelay(reminder, relay)
  })
}
