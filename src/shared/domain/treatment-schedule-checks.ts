import { differenceInCalendarDays } from 'date-fns'

import { isCalendarDay } from './calendar-day'
import { MAX_FREQUENCY_VALUE } from './treatment-frequency'
import { DAYS_PER_STEP, compareText, previousDay, toDate } from './treatment-schedule-dues'
import { closingDay, orderPeriods } from './treatment-schedule-plan'
import type {
  Frequency,
  TreatmentDoseInput,
  TreatmentPeriodInput,
  TreatmentScheduleInput,
} from './treatment-schedule-types'

const UNITS: readonly string[] = ['day', 'week', 'month']
const STATUSES: readonly string[] = ['given', 'missed', 'postponed']

export const MAX_DUES = 50_000

export function invalid(detail: string): RangeError {
  return new RangeError(`Calendrier de traitement invalide : ${detail}`)
}

export function isClockTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

export function checkDay(day: unknown, label: string): void {
  if (!isCalendarDay(day)) throw invalid(`${label} ${JSON.stringify(day)}`)
}

function checkOptionalDay(day: unknown, label: string): void {
  if (day !== null) checkDay(day, label)
}

export function checkPastDay(day: string, today: string, label: string): void {
  checkDay(day, label)
  if (day > today) throw invalid(`${label} ${day} : date future`)
}

export function checkFrequency(frequency: Frequency | null, label: string): void {
  const value: unknown = frequency?.value
  const valid =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_FREQUENCY_VALUE &&
    UNITS.includes(frequency?.unit ?? '')
  if (!valid) throw invalid(`${label}fréquence ${JSON.stringify(frequency)}`)
}

function checkPeriod(period: TreatmentPeriodInput): void {
  const label = `période ${period.id}, `
  checkFrequency(period.frequency, label)
  checkDay(period.startsOn, `${label}début`)
  checkDay(period.firstDueOn, `${label}première échéance`)
  checkOptionalDay(period.endsOn, `${label}fin`)
  checkOptionalDay(period.stoppedOn, `${label}arrêt`)
  const { times } = period
  const valid =
    Array.isArray(times) && times.every(isClockTime) && new Set(times).size === times.length
  if (!valid) throw invalid(`${label}heures ${JSON.stringify(times)}`)
}

function checkDose(dose: TreatmentDoseInput): void {
  const label = `prise ${dose.id}, `
  checkDay(dose.dueOn, `${label}échéance`)
  checkOptionalDay(dose.givenOn, `${label}date réelle`)
  checkDay(dose.nextDueDate, `${label}prochaine échéance`)
  if (dose.dueTime !== null && !isClockTime(dose.dueTime)) {
    throw invalid(`${label}heure ${JSON.stringify(dose.dueTime)}`)
  }
  if (!STATUSES.includes(dose.status)) throw invalid(`${label}état ${JSON.stringify(dose.status)}`)
}

function estimatedDues(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
  today: string,
): number {
  const keys = doses.map((dose) => dose.dueOn)
  const arrivals = doses
    .filter((dose) => dose.status === 'postponed')
    .map((dose) => dose.nextDueDate)
  const first = [period.firstDueOn, ...keys, ...arrivals].sort(compareText)[0] ?? today
  const close = closesOn === null ? null : previousDay(closesOn)
  const end = [period.endsOn, close, today].filter((day) => day !== null).sort(compareText)[0]
  const last = [end ?? today, ...keys].sort(compareText).at(-1) ?? today
  const span = Math.max(0, differenceInCalendarDays(toDate(last), toDate(first)))
  const stepDays = DAYS_PER_STEP[period.frequency.unit] * period.frequency.value
  const perDay = Math.max(1, period.times.length)
  return (Math.floor(span / stepDays) + 2) * perDay + doses.length
}

export function checkInput({ periods, doses, today }: TreatmentScheduleInput): void {
  checkDay(today, 'today')
  periods.forEach(checkPeriod)
  doses.forEach(checkDose)
  const ordered = orderPeriods(periods)
  const total = ordered.reduce((sum, period, index) => {
    const ownDoses = doses.filter((dose) => dose.periodId === period.id)
    return sum + estimatedDues(period, closingDay(period, ordered[index + 1]), ownDoses, today)
  }, 0)
  if (total > MAX_DUES) {
    throw new RangeError(`Calendrier de traitement trop long : environ ${total} échéances`)
  }
}
