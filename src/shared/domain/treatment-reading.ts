import { differenceInCalendarDays } from 'date-fns'

import { isCalendarDay, previousDay, toDate } from './calendar-day'
import { isClockTime } from './clock-time'
import {
  FALLEN_DOSES_ANSWERS,
  treatmentView,
  type IdleReason,
  type Line,
  type Setting,
  type TreatmentView,
  type TreatmentViewInput,
} from './dose-calendar'
import { DAYS_PER_STEP, FREQUENCY_UNITS, MAX_FREQUENCY_VALUE } from './treatment-frequency'

/** `settingsWrittenAt` : dernière écriture de ce qui fait le calendrier (R10, #867). */
type Period = Omit<Setting, 'updatedAt'> & { settingsWrittenAt?: string }
type Dose = Omit<Line, 'settingId'> & { periodId: string }

/** Les périodes et les prises d'un traitement telles que la base les rend. */
export type TreatmentRecords = { periods: readonly Period[]; doses: readonly Dose[] }

const MAX_DUES = 50_000
const STATUSES: readonly string[] = ['given', 'missed', 'postponed', 'extra', 'shift', 'not-due']
const UNITS: readonly string[] = FREQUENCY_UNITS
const ANSWERS: readonly string[] = FALLEN_DOSES_ANSWERS

const isOptionalDay = (day: unknown) => day === null || isCalendarDay(day)

function isReadableSetting({ frequency, times, ...days }: Setting): boolean {
  const { value, unit } = frequency ?? {}
  return (
    [days.startsOn, days.firstDueOn].every(isCalendarDay) &&
    isOptionalDay(days.gridOriginOn) &&
    typeof days.firstDueChosen === 'boolean' &&
    ANSWERS.includes(days.fallenDosesAnswer) &&
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

function isReadableLine(line: Line): boolean {
  const moves = line.status === 'postponed' || line.status === 'shift'
  return (
    STATUSES.includes(line.status) &&
    isCalendarDay(line.dueOn) &&
    isOptionalDay(line.givenOn) &&
    (line.dueTime === null || isClockTime(line.dueTime)) &&
    isOptionalDay(line.targetOn) &&
    (!moves || line.targetOn !== null) &&
    isOptionalDay(line.previousTargetOn ?? null) &&
    (line.previousTargetTime === undefined ||
      line.previousTargetTime === null ||
      isClockTime(line.previousTargetTime)) &&
    (line.dueRank === undefined ||
      line.dueRank === null ||
      (Number.isInteger(line.dueRank) && line.dueRank >= 1))
  )
}

function byStart(a: Setting, b: Setting): number {
  const key = ({ startsOn, createdAt, id }: Setting) => `${startsOn} ${createdAt} ${id}`
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
}

function estimatedSettingDues(
  setting: Setting,
  next: Setting | undefined,
  lines: readonly Line[],
  today: string,
): number {
  const keys = lines.map(({ dueOn }) => dueOn)
  const arrivals = lines.flatMap(({ status, targetOn }) =>
    status === 'postponed' && targetOn !== null ? [targetOn] : [],
  )
  const first = [setting.firstDueOn, ...keys, ...arrivals].sort()[0]!
  const closesOn = [setting.stoppedOn, next?.startsOn ?? null]
    .filter((day) => day !== null)
    .sort()[0]
  const close = closesOn === undefined ? null : previousDay(closesOn)
  const end = [setting.endsOn, close, today].filter((day) => day !== null).sort()[0]!
  const last = [end, ...keys].sort().at(-1)!
  const span = Math.max(0, differenceInCalendarDays(toDate(last), toDate(first)))
  const stepDays = DAYS_PER_STEP[setting.frequency.unit] * setting.frequency.value
  const perDay = Math.max(1, setting.times.length)
  return (Math.floor(span / stepDays) + 2) * perDay + lines.length
}

/** Réglage par réglage, jusqu'à aujourd'hui ou sa fin. */
function estimatedDues({ settings, lines, today }: TreatmentViewInput): number {
  const ordered = [...settings].sort(byStart)
  return ordered.reduce((sum, setting, index) => {
    const own = lines.filter(({ settingId }) => settingId === setting.id)
    return sum + estimatedSettingDues(setting, ordered[index + 1], own, today)
  }, 0)
}

export function carnetInputOf(
  { periods, doses }: TreatmentRecords,
  today: string,
  device: string | undefined,
): TreatmentViewInput {
  return {
    settings: periods.map((period) => ({
      id: period.id,
      startsOn: period.startsOn,
      firstDueOn: period.firstDueOn,
      gridOriginOn: period.gridOriginOn,
      firstDueChosen: period.firstDueChosen,
      fallenDosesAnswer: period.fallenDosesAnswer,
      endsOn: period.endsOn,
      stoppedOn: period.stoppedOn,
      frequency: period.frequency,
      times: period.times,
      createdAt: period.createdAt,
      updatedAt: period.settingsWrittenAt,
      ...(period.gridWrittenAt === undefined ? {} : { gridWrittenAt: period.gridWrittenAt }),
      ...(period.gridBefore ? { gridBefore: period.gridBefore } : {}),
    })),
    lines: doses.map((dose) => ({
      id: dose.id,
      settingId: dose.periodId,
      dueOn: dose.dueOn,
      dueTime: dose.dueTime,
      status: dose.status,
      givenOn: dose.givenOn,
      targetOn: dose.targetOn,
      decidedAt: dose.decidedAt,
      ...(dose.status === 'postponed' && dose.dueRank !== undefined
        ? {
            previousTargetOn: dose.previousTargetOn ?? null,
            previousTargetTime: dose.previousTargetTime ?? null,
            dueRank: dose.dueRank,
          }
        : {}),
      ...(dose.createdByDevice === undefined ? {} : { createdByDevice: dose.createdByDevice }),
    })),
    today,
    ...(device === undefined ? {} : { device }),
  }
}

/** La vue d'un traitement et le carnet qu'elle lit : les gestes et leur aperçu jouent sur ce carnet. */
export type TreatmentReading = { view: TreatmentView; input: TreatmentViewInput }

/** R12 : la lecture d'un carnet du moteur, enregistré ou simulé ; `null` quand il est illisible. */
export function readCarnet(input: TreatmentViewInput): TreatmentReading | null {
  return isReadableCarnet(input) ? { view: treatmentView(input), input } : null
}

export function isReadableCarnet(input: TreatmentViewInput): boolean {
  return (
    input.settings.every(isReadableSetting) &&
    input.lines.every(isReadableLine) &&
    estimatedDues(input) <= MAX_DUES
  )
}

/**
 * R12 : la lecture d'un traitement enregistré ; `null` quand ses données sont illisibles. `device` : le
 * téléphone qui fait le geste (TR-25).
 */
export function readTreatment(
  treatment: TreatmentRecords,
  today: string,
  device?: string,
): TreatmentReading | null {
  return readCarnet(carnetInputOf(treatment, today, device))
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
