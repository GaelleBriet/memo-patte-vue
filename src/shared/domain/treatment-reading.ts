import { differenceInCalendarDays } from 'date-fns'

import { isCalendarDay, previousDay, toDate } from './calendar-day'
import { isClockTime } from './clock-time'
import {
  treatmentView,
  type IdleReason,
  type Line,
  type Setting,
  type TreatmentView,
  type TreatmentViewInput,
} from './dose-calendar'
import { DAYS_PER_STEP, FREQUENCY_UNITS, MAX_FREQUENCY_VALUE } from './treatment-frequency'

type Period = Setting
type Dose = Omit<Line, 'settingId'> & { periodId: string }

/** Les périodes et les prises d'un traitement telles que la base les rend. */
export type TreatmentRecords = { periods: readonly Period[]; doses: readonly Dose[] }

const MAX_DUES = 50_000
const STATUSES: readonly string[] = ['given', 'missed', 'postponed', 'extra', 'shift']
const UNITS: readonly string[] = FREQUENCY_UNITS

const isOptionalDay = (day: unknown) => day === null || isCalendarDay(day)

function isReadablePeriod({ frequency, times, ...days }: Period): boolean {
  const { value, unit } = frequency ?? {}
  return (
    [days.startsOn, days.firstDueOn].every(isCalendarDay) &&
    isOptionalDay(days.gridOriginOn) &&
    isOptionalDay(days.endsOn) &&
    isOptionalDay(days.stoppedOn) &&
    Number.isInteger(value) &&
    value! >= 1 &&
    value! <= MAX_FREQUENCY_VALUE &&
    UNITS.includes(unit ?? '') &&
    Array.isArray(times) &&
    times.every(isClockTime) &&
    new Set(times).size === times.length
  )
}

function isReadableDose(dose: Dose): boolean {
  const moves = dose.status === 'postponed' || dose.status === 'shift'
  return (
    STATUSES.includes(dose.status) &&
    isCalendarDay(dose.dueOn) &&
    isOptionalDay(dose.givenOn) &&
    (dose.dueTime === null || isClockTime(dose.dueTime)) &&
    isOptionalDay(dose.targetOn) &&
    (!moves || dose.targetOn !== null)
  )
}

function byStart(a: Period, b: Period): number {
  const key = ({ startsOn, createdAt, id }: Period) => `${startsOn} ${createdAt} ${id}`
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
}

function estimatedPeriodDues(
  period: Period,
  next: Period | undefined,
  doses: readonly Dose[],
  today: string,
): number {
  const keys = doses.map(({ dueOn }) => dueOn)
  const arrivals = doses.flatMap(({ status, targetOn }) =>
    status === 'postponed' && targetOn !== null ? [targetOn] : [],
  )
  const first = [period.firstDueOn, ...keys, ...arrivals].sort()[0]!
  const closesOn = [period.stoppedOn, next?.startsOn ?? null]
    .filter((day) => day !== null)
    .sort()[0]
  const close = closesOn === undefined ? null : previousDay(closesOn)
  const end = [period.endsOn, close, today].filter((day) => day !== null).sort()[0]!
  const last = [end, ...keys].sort().at(-1)!
  const span = Math.max(0, differenceInCalendarDays(toDate(last), toDate(first)))
  const stepDays = DAYS_PER_STEP[period.frequency.unit] * period.frequency.value
  const perDay = Math.max(1, period.times.length)
  return (Math.floor(span / stepDays) + 2) * perDay + doses.length
}

/** Réglage par réglage, jusqu'à aujourd'hui ou sa fin : la même borne que l'ancien moteur. */
function estimatedDues({ periods, doses }: TreatmentRecords, today: string): number {
  const ordered = [...periods].sort(byStart)
  return ordered.reduce((sum, period, index) => {
    const own = doses.filter(({ periodId }) => periodId === period.id)
    return sum + estimatedPeriodDues(period, ordered[index + 1], own, today)
  }, 0)
}

function viewInputOf({ periods, doses }: TreatmentRecords, today: string): TreatmentViewInput {
  return {
    settings: periods.map((period) => ({
      id: period.id,
      startsOn: period.startsOn,
      firstDueOn: period.firstDueOn,
      gridOriginOn: period.gridOriginOn,
      endsOn: period.endsOn,
      stoppedOn: period.stoppedOn,
      frequency: period.frequency,
      times: period.times,
      createdAt: period.createdAt,
    })),
    lines: doses.map((dose) => ({
      id: dose.id,
      settingId: dose.periodId,
      dueOn: dose.dueOn,
      dueTime: dose.dueTime,
      status: dose.status,
      givenOn: dose.givenOn,
      targetOn: dose.targetOn,
      updatedAt: dose.updatedAt,
    })),
    today,
  }
}

/** La vue d'un traitement et le carnet qu'elle lit : les gestes et leur aperçu jouent sur ce carnet. */
export type TreatmentReading = { view: TreatmentView; input: TreatmentViewInput }

/** R12 : la lecture d'un traitement enregistré ; `null` quand ses données sont illisibles. */
export function readTreatment(treatment: TreatmentRecords, today: string): TreatmentReading | null {
  const readable =
    treatment.periods.every(isReadablePeriod) &&
    treatment.doses.every(isReadableDose) &&
    estimatedDues(treatment, today) <= MAX_DUES
  if (!readable) return null
  const input = viewInputOf(treatment, today)
  return { view: treatmentView(input), input }
}

export function treatmentReading(treatment: TreatmentRecords, today: string): TreatmentView | null {
  return readTreatment(treatment, today)?.view ?? null
}

const DUPLICATES: readonly IdleReason[] = ['superseded', 'back-to-date', 'beaten']

/** Les lignes qui comptent une prise, dans l'ordre chronologique : sans les doublons d'une même échéance. */
export function countedLines(view: Pick<TreatmentView, 'history'>): Line[] {
  return view.history
    .filter(({ effect }) => effect.kind !== 'idle' || !DUPLICATES.includes(effect.reason))
    .map(({ line }) => line)
}

/** R11, R12 : chaque ligne de l'historique, `idle` quand elle est sans effet (« · sans effet »). */
export function historyEntries(
  view: Pick<TreatmentView, 'history'>,
): { line: Line; idle: boolean }[] {
  return view.history.map(({ line, effect }) => ({ line, idle: effect.kind === 'idle' }))
}
