import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  formatISO,
} from 'date-fns'

import { isCalendarDay } from './calendar-day'
import { MAX_FREQUENCY_VALUE } from './treatment-frequency'

export type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

export type TreatmentPeriodInput = {
  id: string
  startsOn: string
  firstDueOn: string
  endsOn: string | null
  stoppedOn: string | null
  frequency: Frequency
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: readonly string[]
  createdAt: string
}

export type DoseStatus = 'given' | 'missed' | 'postponed'

export type TreatmentDoseInput = {
  id: string
  periodId: string
  dueOn: string
  dueTime: string | null
  /** `null` pour une prise oubliée ou reportée. */
  givenOn: string | null
  status: DoseStatus
  /** Prochaine échéance fixée par la prise ; pour un report, sa nouvelle date. */
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

/** Entrée vérifiée : une donnée illisible ou démesurée lève une `RangeError` qui la nomme. */
export type TreatmentScheduleInput = {
  periods: readonly TreatmentPeriodInput[]
  doses: readonly TreatmentDoseInput[]
  /** `yyyy-MM-dd` : le module ne lit jamais l'horloge. */
  today: string
}

export type Due = { periodId: string; dueOn: string; dueTime: string | null }

/** `ended` : date de fin passée, dernière échéance notée, ou aucune période. */
export type TreatmentPhase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'

export type DoseGesture =
  { kind: 'given'; due: Due; givenOn: string } | { kind: 'missed'; due: Due }

export type DoseFields = Pick<
  TreatmentDoseInput,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** `postponement` : le déplacement gardé (TR-24 bis), ou ceux que la nouvelle date laisse sans effet, à supprimer. */
export type RedatedDose = {
  dose: DoseFields
  postponement: { doseIds: string[]; kept: boolean } | null
}

/** Ligne de déplacement à créer, à réécrire (Q18), à supprimer quand la dose revient à sa date, ou rien. */
export type MovedDose =
  | { action: 'create'; dose: DoseFields }
  | { action: 'rewrite'; dose: DoseFields; doseId: string }
  | { action: 'delete'; doseId: string }
  | { action: 'none' }

/** Bornes de « Prochaine dose » (TR-9) ; `latest` : la date de fin, `null` sans date de fin. */
export type MoveBounds = { earliest: string; latest: string | null }

export type NewPeriod = { startsOn: string; firstDueOn: string }

export type TreatmentSchedule = {
  phase: TreatmentPhase
  /** Fini ou arrêté sans rien à renseigner (« Traitements terminés ») ; vrai aussi sans période. */
  finished: boolean
  /** Doses du moment (TR-10) : heures du jour sans prise, sinon la dernière en retard, sinon la prochaine. */
  currentDoses: Due[]
  /** Première échéance sans prise après aujourd'hui. */
  nextDue: Due | null
  /** Doses non renseignées (TR-13), jamais comptées comme des retards. */
  unloggedDoses: Due[]
  /** Lignes de l'historique, une par échéance (la plus récemment modifiée) ; sans les déplacements sans effet. */
  doses: TreatmentDoseInput[]
  /** Déplacements sans effet (dépassés, revenus à leur date) : à supprimer avec la prochaine écriture. */
  staleDoseIds: string[]
  currentPeriodId: string | null
  /** TR-28 : une prise, même oubliée ou reportée, existe dans la période en cours. */
  currentPeriodHasDose: boolean
  /** Échéances sans prise à partir d'aujourd'hui inclus. */
  upcoming(limit: number): Due[]
  /** Échéance visée par une prise notée à cette date, à cette heure s'il y en a plusieurs. */
  dueForDate(givenOn: string, time?: string | null): Due | null
  /** Champs de la prise à écrire, calculés sur le carnet d'avant le geste (renseigner : un appel par dose). */
  doseFor(gesture: DoseGesture): DoseFields
  /** TR-24 bis : nouvelle date d'une prise donnée. */
  redate(doseId: string, givenOn: string): RedatedDose
  /** « Prochaine dose » (TR-9, Q17, Q18) : déplace la dose, plus tôt ou plus tard. */
  move(due: Due, to: string): MovedDose
  /** `null` : cette dose ne se déplace pas (aucune date possible, ou dose d'une période précédente). */
  moveBounds(due: Due): MoveBounds | null
  /** Dates d'une période ouverte par « Modifier » (TR-28, Q7, Q24), selon ses heures. */
  newPeriod(frequency: Frequency, times: readonly string[]): NewPeriod
}

type Sequence = { origin: string; firstStep: number; floor: string }

type Step = { kind: 'note' | 'move'; dose: TreatmentDoseInput; position: string }

type PeriodPlan = {
  period: TreatmentPeriodInput
  closesOn: string | null
  steps: Step[]
  stale: TreatmentDoseInput[]
  anchors: { position: string; sequence: Sequence }[]
  between: Due[]
  noteKeys: Set<string>
  noteDays: Set<string>
  covered: Set<string>
  fallenKeys: string[]
}

type Window = { from?: string; to?: string; limit?: number }

type DueEntry = { due: Due; status: DoseStatus | null }

type State = {
  input: TreatmentScheduleInput
  noted: Set<string>
  plans: PeriodPlan[]
  open: PeriodPlan | null
  phase: TreatmentPhase
  currentDoses: Due[]
  unloggedDoses: Due[]
}

const UNITS: readonly string[] = ['day', 'week', 'month']
const STATUSES: readonly string[] = ['given', 'missed', 'postponed']
const DAYS_PER_STEP = { day: 1, week: 7, month: 28 }
const MAX_DUES = 50_000

// Bien plus rapide que `parseISO` et `format` : un calcul décale des milliers de dates.
function toDate(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

function toDay(date: Date): string {
  return formatISO(date, { representation: 'date' })
}

function shiftDate(date: string, { value, unit }: Frequency, steps: number): string {
  if (steps === 0) return date
  const start = toDate(date)
  const amount = value * steps
  const shifted =
    unit === 'day'
      ? addDays(start, amount)
      : unit === 'week'
        ? addWeeks(start, amount)
        : addMonths(start, amount)
  return toDay(shifted)
}

function nextDay(date: string): string {
  return toDay(addDays(toDate(date), 1))
}

function previousDay(date: string): string {
  return toDay(addDays(toDate(date), -1))
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function keyOf({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): string {
  return `${dueOn} ${dueTime ?? ''}`
}

function dueId(due: Due): string {
  return `${due.periodId} ${keyOf(due)}`
}

function dueOf({ periodId, dueOn, dueTime }: Due): Due {
  return { periodId, dueOn, dueTime }
}

function sameDue(a: Due, b: Due): boolean {
  return dueId(a) === dueId(b)
}

function uniqueSorted(dues: Due[]): Due[] {
  const unique = new Map(dues.map((due) => [dueId(due), due]))
  return [...unique.values()].sort((a, b) => compareText(keyOf(a), keyOf(b)))
}

function invalid(detail: string): RangeError {
  return new RangeError(`Calendrier de traitement invalide : ${detail}`)
}

function isClockTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

function checkDay(day: unknown, label: string): void {
  if (!isCalendarDay(day)) throw invalid(`${label} ${JSON.stringify(day)}`)
}

function checkOptionalDay(day: unknown, label: string): void {
  if (day !== null) checkDay(day, label)
}

function checkPastDay(day: string, today: string, label: string): void {
  checkDay(day, label)
  if (day > today) throw invalid(`${label} ${day} : date future`)
}

function checkFrequency(frequency: Frequency | null, label: string): void {
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

function checkInput({ periods, doses, today }: TreatmentScheduleInput): void {
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

function compareDoses(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return (
    compareText(keyOf(a), keyOf(b)) ||
    compareText(a.createdAt, b.createdAt) ||
    compareText(a.id, b.id)
  )
}

function isMoreRecent(a: TreatmentDoseInput, b: TreatmentDoseInput): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)
}

function mergeDoses(doses: readonly TreatmentDoseInput[]): TreatmentDoseInput[] {
  const latest = new Map<string, TreatmentDoseInput>()
  for (const dose of doses) {
    const kept = latest.get(dueId(dose))
    if (kept === undefined || isMoreRecent(dose, kept)) latest.set(dueId(dose), dose)
  }
  return [...latest.values()].sort(compareDoses)
}

function orderPeriods(periods: readonly TreatmentPeriodInput[]): TreatmentPeriodInput[] {
  return [...periods].sort(
    (a, b) =>
      compareText(a.startsOn, b.startsOn) ||
      compareText(a.createdAt, b.createdAt) ||
      compareText(a.id, b.id),
  )
}

/** « Avancée au … » plutôt que « Reportée au … » : la nouvelle date précède l'échéance remplacée. */
export function isAdvanced(
  dose: Pick<TreatmentDoseInput, 'status' | 'dueOn' | 'nextDueDate'>,
): boolean {
  return dose.status === 'postponed' && dose.nextDueDate < dose.dueOn
}

function referenceOf(dose: TreatmentDoseInput): string {
  return dose.status === 'given' && dose.givenOn !== null ? dose.givenOn : dose.dueOn
}

function fixesSuiteFromItsDate(dose: TreatmentDoseInput, frequency: Frequency): boolean {
  return shiftDate(referenceOf(dose), frequency, 1) === dose.nextDueDate
}

function positionOf(key: string, rank: 0 | 1): string {
  return `${key}#${rank}`
}

function compareCreation(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
}

// Avancé (Q17), un déplacement agit au début de sa nouvelle date ; reporté, après les prises de son jour d'origine.
function stepOf(dose: TreatmentDoseInput): Step {
  if (dose.status !== 'postponed') {
    return { kind: 'note', dose, position: positionOf(keyOf(dose), 1) }
  }
  const actsOn = dose.nextDueDate < dose.dueOn ? `${dose.nextDueDate} ` : `${dose.dueOn} ~`
  return { kind: 'move', dose, position: positionOf(actsOn, 0) }
}

function stepsOf(doses: TreatmentDoseInput[]): Step[] {
  return doses
    .map(stepOf)
    .sort((a, b) => compareText(a.position, b.position) || compareCreation(a.dose, b.dose))
}

function isNote(step: Step): boolean {
  return step.kind === 'note'
}

function isMove(step: Step): boolean {
  return step.kind === 'move'
}

// Un report laisse tomber l'échéance qu'il remplace ; une dose avancée, non.
function hasFallen({ kind, dose }: Step): boolean {
  return kind === 'note' || dose.nextDueDate > dose.dueOn
}

// TR-24 bis : un déplacement qui ne tombe plus après la prise qui fixait sa suite est dépassé.
function isOvertaken(step: Step, previous: Step | undefined, frequency: Frequency): boolean {
  return (
    step.kind === 'move' &&
    previous?.kind === 'note' &&
    fixesSuiteFromItsDate(previous.dose, frequency) &&
    step.dose.nextDueDate <= referenceOf(previous.dose)
  )
}

function initialSequence(period: TreatmentPeriodInput): Sequence {
  return { origin: period.firstDueOn, firstStep: 0, floor: '' }
}

function firstStepFrom(sequence: Sequence, { value, unit }: Frequency, day: string): number {
  if (day <= sequence.origin) return sequence.firstStep
  const origin = toDate(sequence.origin)
  const target = toDate(day)
  const elapsed =
    unit === 'month'
      ? differenceInCalendarMonths(target, origin)
      : differenceInCalendarDays(target, origin) / (unit === 'week' ? 7 : 1)
  return Math.max(sequence.firstStep, Math.floor(elapsed / value) - 1)
}

function* sequenceDues(
  sequence: Sequence,
  period: TreatmentPeriodInput,
  fromDay = '',
): Generator<Due, never> {
  const times = period.times.length > 0 ? [...period.times].sort() : [null]
  const floorDay = sequence.floor.slice(0, 10)
  const startDay = fromDay > floorDay ? fromDay : floorDay
  for (let step = firstStepFrom(sequence, period.frequency, startDay); ; step += 1) {
    const dueOn = shiftDate(sequence.origin, period.frequency, step)
    for (const dueTime of times) {
      const due = { periodId: period.id, dueOn, dueTime }
      if (keyOf(due) > sequence.floor) yield due
    }
  }
}

function firstDueOf(sequence: Sequence, period: TreatmentPeriodInput): Due {
  return sequenceDues(sequence, period).next().value
}

function sequenceAfter(
  { kind, dose }: Step,
  period: TreatmentPeriodInput,
  current: Sequence,
): Sequence {
  if (kind === 'move') return { origin: dose.nextDueDate, firstStep: 0, floor: current.floor }
  const reference = referenceOf(dose)
  const floor = keyOf(dose)
  if (shiftDate(reference, period.frequency, 1) === dose.nextDueDate) {
    return { origin: reference, firstStep: 1, floor }
  }
  const continued = { ...current, floor }
  return firstDueOf(continued, period).dueOn === dose.nextDueDate
    ? continued
    : { origin: dose.nextDueDate, firstStep: 0, floor }
}

function distanceInDays(a: string, b: string): number {
  return Math.abs(differenceInCalendarDays(toDate(a), toDate(b)))
}

// Les échéances déjà produites restent sous la main : une ligne sans effet ne fait rien recalculer.
type Cursor = { dues: Generator<Due, never>; ahead: Due[] }

function cursorOn(sequence: Sequence, period: TreatmentPeriodInput): Cursor {
  return { dues: sequenceDues(sequence, period), ahead: [] }
}

function duesLeftBefore({ kind, dose }: Step, cursor: Cursor) {
  const key = keyOf(dose)
  let after = cursor.ahead.at(-1)
  while (after === undefined || keyOf(after) <= key) {
    after = cursor.dues.next().value
    cursor.ahead.push(after)
  }
  const before = cursor.ahead.filter((due) => keyOf(due) <= key)
  const next = cursor.ahead[before.length] ?? after
  const last = before.at(-1)
  if (last !== undefined && keyOf(last) === key) return { left: before.slice(0, -1), exact: true }
  // Suite décalée par une prise d'avant corrigée : le déplacement remplace la journée la plus proche de la sienne.
  const takesLast =
    kind === 'move' &&
    last !== undefined &&
    distanceInDays(last.dueOn, dose.dueOn) <= distanceInDays(next.dueOn, dose.dueOn)
  const left = takesLast ? before.filter((due) => due.dueOn !== last.dueOn) : before
  return { left, exact: false }
}

function latestOf(days: (string | null | undefined)[]): string | undefined {
  return days
    .filter((day) => day !== null && day !== undefined)
    .sort(compareText)
    .at(-1)
}

// Sans effet : revenu à sa date d'origine, ou arrivé sur ce qui le précède (dose sans prise, ligne d'avant).
function hasNoEffect(step: Step, previous: Step | undefined, left: Due[], exact: boolean): boolean {
  if (step.kind === 'note') return false
  const { dueOn, nextDueDate } = step.dose
  const before = latestOf([left.at(-1)?.dueOn, previous?.dose.dueOn])
  return (exact && nextDueDate === dueOn) || (before !== undefined && nextDueDate <= before)
}

// Q21 : la journée part avec sa première heure sans prise.
function leavesWith(move: TreatmentDoseInput, due: Due): boolean {
  return due.dueOn === move.dueOn && keyOf(due) >= keyOf(move)
}

// Q24 : les prises du jour du changement comptent pour les premières heures du nouveau réglage.
function coveredKeys(period: TreatmentPeriodInput, notedThatDay: number): Set<string> {
  if (period.firstDueOn !== period.startsOn) return new Set()
  const times = period.times.length === 0 ? [null] : [...period.times].sort(compareText)
  return new Set(
    times.slice(0, notedThatDay).map((dueTime) => keyOf({ dueOn: period.startsOn, dueTime })),
  )
}

function planPeriod(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
  notedOnStart: number,
): PeriodPlan {
  const steps: Step[] = []
  const stale: TreatmentDoseInput[] = []
  const anchors: PeriodPlan['anchors'] = []
  let between: Due[] = []
  let sequence = initialSequence(period)
  let cursor = cursorOn(sequence, period)
  for (const step of stepsOf(doses)) {
    const previous = steps.at(-1)
    const { left, exact } = duesLeftBefore(step, cursor)
    if (hasNoEffect(step, previous, left, exact) || isOvertaken(step, previous, period.frequency)) {
      stale.push(step.dose)
      continue
    }
    between.push(...left)
    if (step.kind === 'move') between = between.filter((due) => !leavesWith(step.dose, due))
    sequence = sequenceAfter(step, period, sequence)
    cursor = cursorOn(sequence, period)
    anchors.push({ position: step.position, sequence })
    steps.push(step)
  }
  const notes = steps.filter(isNote).map(({ dose }) => dose)
  return {
    period,
    closesOn,
    steps,
    stale,
    anchors,
    between,
    noteKeys: new Set(notes.map(keyOf)),
    noteDays: new Set(notes.map((dose) => dose.dueOn)),
    covered: coveredKeys(period, notedOnStart),
    fallenKeys: steps
      .filter(hasFallen)
      .map(({ dose }) => keyOf(dose))
      .sort(compareText),
  }
}

function closingDay(
  period: TreatmentPeriodInput,
  next: TreatmentPeriodInput | undefined,
): string | null {
  const bounds = [period.stoppedOn, next?.startsOn ?? null].filter((day) => day !== null)
  return bounds.sort(compareText)[0] ?? null
}

function isWithinPeriod(plan: PeriodPlan, dueOn: string): boolean {
  const { endsOn } = plan.period
  return (endsOn === null || dueOn <= endsOn) && (plan.closesOn === null || dueOn < plan.closesOn)
}

function sequenceAt(plan: PeriodPlan, position: string): Sequence {
  let low = 0
  let high = plan.anchors.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((plan.anchors[middle]?.position ?? position) < position) low = middle + 1
    else high = middle
  }
  return plan.anchors[low - 1]?.sequence ?? initialSequence(plan.period)
}

// Une période ouverte sans date de fin est infinie : `to` ou `limit` la bornent.
function pendingDues(plan: PeriodPlan, { from = '', to, limit = Infinity }: Window): Due[] {
  const isPending = (due: Due) =>
    isWithinPeriod(plan, due.dueOn) &&
    !plan.noteKeys.has(keyOf(due)) &&
    !plan.covered.has(keyOf(due)) &&
    due.dueOn >= from &&
    (to === undefined || due.dueOn <= to)
  const tail: Due[] = []
  const lastSequence = plan.anchors.at(-1)?.sequence ?? initialSequence(plan.period)
  for (const due of sequenceDues(lastSequence, plan.period, from)) {
    if (!isWithinPeriod(plan, due.dueOn) || (to !== undefined && due.dueOn > to)) break
    if (tail.length >= limit) break
    if (isPending(due)) tail.push(due)
  }
  return uniqueSorted([...plan.between.filter(isPending), ...tail]).slice(0, limit)
}

function latestFallenKey(plan: PeriodPlan, today: string): string {
  return plan.fallenKeys.filter((key) => key.slice(0, 10) <= today).at(-1) ?? ''
}

// Q23 : la dernière journée d'échéance arrivée reste entière la dose du moment.
function dosesOfTheMoment(plan: PeriodPlan, fallen: Due[], today: string): Due[] {
  const lastDay = fallen.at(-1)?.dueOn
  if (lastDay !== undefined && lastDay >= latestFallenKey(plan, today).slice(0, 10)) {
    return fallen.filter((due) => due.dueOn === lastDay)
  }
  return pendingDues(plan, { from: nextDay(today), limit: 1 })
}

function phaseOf(current: Due | undefined, today: string): TreatmentPhase {
  if (current === undefined) return 'ended'
  if (current.dueOn === today) return 'today'
  return current.dueOn < today ? 'overdue' : 'upcoming'
}

// Une reprise après un arrêt (TR-30) garde sa première prise : seul un changement de réglage compte.
function notedOn(
  day: string,
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): number {
  const changed = new Set(earlier.filter((period) => period.stoppedOn === null).map(({ id }) => id))
  return doses.filter(
    (dose) => dose.status !== 'postponed' && dose.dueOn === day && changed.has(dose.periodId),
  ).length
}

function build(input: TreatmentScheduleInput): State {
  const { today } = input
  const periods = orderPeriods(input.periods)
  const doses = mergeDoses(input.doses)
  const plans = periods.map((period, index) =>
    planPeriod(
      period,
      closingDay(period, periods[index + 1]),
      doses.filter((dose) => dose.periodId === period.id),
      notedOn(period.startsOn, periods.slice(0, index), doses),
    ),
  )
  const current = plans.at(-1)
  const unlogged = plans
    .slice(0, -1)
    .flatMap((plan) => pendingDues(plan, { to: previousDay(today) }))
  const noted = new Set(plans.flatMap(notesOf).map(dueId))
  const closed = { input, noted, plans, open: null, currentDoses: [] }

  if (current === undefined) return { ...closed, phase: 'ended', unloggedDoses: unlogged }
  const { stoppedOn, endsOn } = current.period
  if (stoppedOn !== null) {
    const before = pendingDues(current, { to: previousDay(today) })
    return { ...closed, phase: 'stopped', unloggedDoses: [...unlogged, ...before] }
  }
  if (endsOn !== null && endsOn < today) {
    return { ...closed, phase: 'ended', unloggedDoses: [...unlogged, ...pendingDues(current, {})] }
  }

  const fallen = pendingDues(current, { to: today })
  const currentDoses = dosesOfTheMoment(current, fallen, today)
  const missedHere = fallen.filter(
    (due) => due.dueOn < today && !currentDoses.some((moment) => sameDue(moment, due)),
  )
  return {
    ...closed,
    open: current,
    phase: phaseOf(currentDoses[0], today),
    currentDoses,
    unloggedDoses: [...unlogged, ...missedHere],
  }
}

function notesOf(plan: PeriodPlan): TreatmentDoseInput[] {
  return plan.steps.filter(isNote).map(({ dose }) => dose)
}

function planOf(state: State, periodId: string): PeriodPlan {
  const plan = state.plans.find(({ period }) => period.id === periodId)
  if (plan === undefined) throw invalid(`période inconnue ${periodId}`)
  return plan
}

function nextInSequence(state: State, due: Due): string {
  const plan = planOf(state, due.periodId)
  const key = keyOf(due)
  const dues = sequenceDues(sequenceAt(plan, positionOf(key, 1)), plan.period, due.dueOn)
  let next = dues.next().value
  while (keyOf(next) <= key) next = dues.next().value
  return next.dueOn
}

function stateWithoutDues(state: State, dues: Due[]): State {
  const doses = state.input.doses.filter((dose) => !dues.some((due) => sameDue(dose, due)))
  return build({ ...state.input, doses })
}

function stateWithout(state: State, due: Due, today = state.input.today): State {
  if (!state.noted.has(dueId(due)) && today === state.input.today) return state
  const doses = state.input.doses.filter((dose) => !sameDue(dose, due))
  return build({ ...state.input, doses, today })
}

function landsOn(from: string, day: string, frequency: Frequency): boolean {
  const { value, unit } = frequency
  if (day <= from) return false
  const start = toDate(from)
  const target = toDate(day)
  if (unit === 'month') {
    const months = differenceInCalendarMonths(target, start)
    return months % value === 0 && shiftDate(from, frequency, months / value) === day
  }
  return differenceInCalendarDays(target, start) % (value * DAYS_PER_STEP[unit]) === 0
}

// La suite ne repart de la date réelle (T2) que pour la dernière heure du jour, si la dose suivante
// tombe après l'échéance couverte, et jamais sur l'échéance d'origine d'un déplacement (sa ligne).
function givenNextDueDate(others: State, due: Due, givenOn: string): string {
  const next = nextInSequence(others, due)
  const plan = planOf(others, due.periodId)
  const { frequency } = plan.period
  const restarted = shiftDate(givenOn, frequency, 1)
  const coversCurrent = others.currentDoses.some((current) => sameDue(current, due))
  const hitsAMove = plan.steps.some(
    ({ kind, dose }) =>
      kind === 'move' && dose.dueOn > due.dueOn && landsOn(givenOn, dose.dueOn, frequency),
  )
  const restarts =
    coversCurrent &&
    givenOn !== due.dueOn &&
    next !== due.dueOn &&
    restarted > due.dueOn &&
    !hitsAMove
  return restarts ? restarted : next
}

// Une prise en avance vise le prochain jour d'échéance : deux jours couvrent chaque heure.
function nearUpcoming(state: State): Due[] {
  const { open, input } = state
  if (open === null) return []
  const perDay = Math.max(1, open.period.times.length)
  return pendingDues(open, { from: nextDay(input.today), limit: 2 * perDay })
}

function visiblePending(state: State): Due[] {
  return [...state.unloggedDoses, ...state.currentDoses, ...nearUpcoming(state)]
}

function knownDues(state: State): Set<string> {
  return new Set([...state.noted, ...visiblePending(state).map(dueId)])
}

function checkKnown(known: () => Set<string>, due: Due): void {
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

function doseFor(state: State, known: () => Set<string>, gesture: DoseGesture): DoseFields {
  const { due } = gesture
  checkKnown(known, due)
  switch (gesture.kind) {
    case 'given': {
      checkPastDay(gesture.givenOn, state.input.today, 'date réelle')
      const nextDueDate = givenNextDueDate(stateWithout(state, due), due, gesture.givenOn)
      return { ...dueOf(due), givenOn: gesture.givenOn, status: 'given', nextDueDate }
    }
    case 'missed': {
      const nextDueDate = nextInSequence(stateWithout(state, due), due)
      return { ...dueOf(due), givenOn: null, status: 'missed', nextDueDate }
    }
  }
}

// La dose déplacée : l'arrivée d'un déplacement tant qu'aucune prise n'y est notée, ou son échéance d'origine.
function movingStep(plan: PeriodPlan, due: Due): TreatmentDoseInput | undefined {
  return plan.steps
    .filter(isMove)
    .map(({ dose }) => dose)
    .filter(
      (move) =>
        (move.nextDueDate === due.dueOn && !plan.noteDays.has(due.dueOn)) ||
        keyOf(move) === keyOf(due),
    )
    .at(-1)
}

function dueDaysOf(dues: Due[]): string[] {
  return dues.map((due) => due.dueOn)
}

// Une ligne par échéance : la dose arrive après tout ce qui a déjà une ligne ou reste sans prise,
// et à moins d'un intervalle de sa date, pour que la suite ne retombe jamais sur une échéance occupée.
function dayBeforeMove(state: State, moved: Due): string {
  const plan = planOf(state, moved.periodId)
  const pending = pendingDues(plan, { to: moved.dueOn }).filter((due) => keyOf(due) < keyOf(moved))
  const earlier = state.plans
    .slice(0, state.plans.indexOf(plan))
    .flatMap((other) => [...other.noteDays, ...dueDaysOf(pendingDues(other, { to: moved.dueOn }))])
  const oneStepBefore = shiftDate(moved.dueOn, plan.period.frequency, -1)
  return (
    latestOf([
      ...plan.steps.map(({ dose }) => dose.dueOn),
      ...notesOf(plan).map((dose) => dose.givenOn),
      ...dueDaysOf(pending),
      ...earlier,
      oneStepBefore,
    ]) ?? oneStepBefore
  )
}

// Le moteur ne tient pas une dose déplacée quand une ligne existe déjà plus loin, même sans effet.
function boundsOf(state: State, moved: Due): MoveBounds | null {
  const { today } = state.input
  const plan = planOf(state, moved.periodId)
  const lines = [...plan.steps.map(({ dose }) => dose), ...plan.stale]
  if (lines.some((dose) => dose.dueOn > moved.dueOn)) return null
  const afterPrevious = nextDay(dayBeforeMove(state, moved))
  const earliest = latestOf([today, plan.period.startsOn, afterPrevious]) ?? today
  const latest = plan.period.endsOn
  return latest !== null && earliest > latest ? null : { earliest, latest }
}

// Q21 : « Prochaine dose » déplace la journée, à partir de sa première heure encore sans prise.
function firstPendingOfDay(state: State, due: Due): Due {
  const sameDay = visiblePending(state).filter(
    (other) => other.periodId === due.periodId && other.dueOn === due.dueOn,
  )
  return uniqueSorted([due, ...sameDay])[0] ?? due
}

function moveBounds(state: State, due: Due): MoveBounds | null {
  const plan = planOf(state, due.periodId)
  if (plan !== state.open) return null
  const existing = movingStep(plan, due)
  return existing === undefined
    ? boundsOf(state, firstPendingOfDay(state, due))
    : boundsOf(stateWithoutDues(state, [existing]), dueOf(existing))
}

function checkMovable(state: State, plan: PeriodPlan, due: Due): void {
  if (plan.noteKeys.has(keyOf(due))) {
    throw new RangeError(`Échéance déjà notée : ${JSON.stringify(due)}`)
  }
  const isPending = visiblePending(state).some((other) => sameDue(other, due))
  if (!isPending && movingStep(plan, due) === undefined) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

function isDueWithout(state: State, move: TreatmentDoseInput): boolean {
  const plan = planOf(stateWithoutDues(state, [move]), move.periodId)
  return pendingDues(plan, { from: move.dueOn, to: move.dueOn }).some((due) => sameDue(due, move))
}

function movedFields(due: Due, to: string): DoseFields {
  return { ...dueOf(due), givenOn: null, status: 'postponed', nextDueDate: to }
}

function move(state: State, due: Due, to: string): MovedDose {
  const plan = planOf(state, due.periodId)
  checkMovable(state, plan, due)
  checkDay(to, 'nouvelle date')
  if (to < state.input.today) throw invalid(`nouvelle date ${to} : date passée`)
  const bounds = moveBounds(state, due)
  if (bounds === null) throw invalid(`cette dose ne se déplace pas : ${JSON.stringify(due)}`)
  if (to < bounds.earliest) throw invalid(`nouvelle date ${to} : pas après l’échéance précédente`)
  if (bounds.latest !== null && to > bounds.latest) {
    throw invalid(`nouvelle date ${to} : après la date de fin`)
  }
  const existing = movingStep(plan, due)
  if (existing === undefined) {
    const moved = firstPendingOfDay(state, due)
    return to === moved.dueOn
      ? { action: 'none' }
      : { action: 'create', dose: movedFields(moved, to) }
  }
  if (to === existing.dueOn && isDueWithout(state, existing)) {
    return { action: 'delete', doseId: existing.id }
  }
  return { action: 'rewrite', dose: movedFields(existing, to), doseId: existing.id }
}

// TR-24 bis ne vaut que pour une prise qui a fixé la suite, avant le déplacement (Q8).
function followingMove(plan: PeriodPlan, index: number): TreatmentDoseInput | null {
  const step = plan.steps[index]
  const next = plan.steps[index + 1]
  const anchor = plan.anchors[index]?.sequence
  if (step?.kind !== 'note' || next?.kind !== 'move' || anchor === undefined) return null
  const { dose } = step
  const fixedTheSuite =
    compareCreation(dose, next.dose) < 0 && fixesSuiteFromItsDate(dose, plan.period.frequency)
  const nothingBetween =
    dose.givenOn !== dose.dueOn || keyOf(firstDueOf(anchor, plan.period)) === keyOf(next.dose)
  return fixedTheSuite && nothingBetween ? next.dose : null
}

function movesLostBy(state: State, redated: TreatmentDoseInput): string[] {
  const doses = state.input.doses.map((dose) => (sameDue(dose, redated) ? redated : dose))
  const after = planOf(build({ ...state.input, doses }), redated.periodId)
  const stale = new Set(after.stale.map(({ id }) => id))
  return planOf(state, redated.periodId)
    .steps.map(({ dose }) => dose.id)
    .filter((id) => stale.has(id))
}

function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  for (const plan of state.plans) {
    const index = plan.steps.findIndex((step) => step.kind === 'note' && step.dose.id === doseId)
    const dose = plan.steps[index]?.dose
    if (dose?.status !== 'given') continue
    const next = followingMove(plan, index)
    const overtakes = next !== null && next.nextDueDate <= givenOn
    const nextDueDate = overtakes
      ? shiftDate(givenOn, plan.period.frequency, 1)
      : givenNextDueDate(stateWithout(state, dose, givenOn), dose, givenOn)
    const fields: DoseFields = { ...dueOf(dose), givenOn, status: 'given', nextDueDate }
    const lost = movesLostBy(state, { ...dose, ...fields })
    if (next !== null && !lost.includes(next.id)) {
      return { dose: fields, postponement: { doseIds: [next.id], kept: true } }
    }
    const postponement = lost.length > 0 ? { doseIds: lost, kept: false } : null
    return { dose: fields, postponement }
  }
  throw new RangeError(`Aucune prise donnée à redater : ${doseId}`)
}

function upcoming(state: State, limit: number): Due[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DUES) throw invalid(`upcoming(${limit})`)
  const { open, input } = state
  return open === null ? [] : pendingDues(open, { from: input.today, limit })
}

function dueForDate(state: State, date: string, time: string | null): Due | null {
  const { today } = state.input
  checkPastDay(date, today, 'date de la prise')
  if (time !== null && !isClockTime(time)) throw invalid(`heure ${JSON.stringify(time)}`)
  const matches = (due: Due) => time === null || due.dueTime === time
  const pending = uniqueSorted([...state.unloggedDoses, ...state.currentDoses])
  const entries: DueEntry[] = [
    ...pending.map((due) => ({ due, status: null })),
    ...state.plans
      .flatMap((plan) => plan.steps.filter(hasFallen))
      .map(({ dose }) => ({ due: dueOf(dose), status: dose.status })),
  ]
    .filter(({ due }) => matches(due))
    .sort((a, b) => compareText(keyOf(a.due), keyOf(b.due)))
  const last = entries.filter(({ due }) => due.dueOn <= date).at(-1)
  if (last !== undefined && (last.status === null || last.status === 'missed')) return last.due
  const ahead = entries.find(({ due, status }) => status === null && due.dueOn > date)
  if (ahead !== undefined) return ahead.due
  return nearUpcoming(state).find(matches) ?? null
}

// Q24 : la nouvelle période commence aujourd'hui ; ses heures au-delà des prises du jour restent à donner.
function newPeriod(state: State, frequency: Frequency, times: readonly string[]): NewPeriod {
  checkFrequency(frequency, '')
  if (!times.every(isClockTime)) throw invalid(`heures ${JSON.stringify(times)}`)
  const { today } = state.input
  const startsOn = latestOf([today, state.plans.at(-1)?.period.startsOn]) ?? today
  const periods = state.plans.map(({ period }) => period)
  const noted = notedOn(startsOn, periods, mergeDoses(state.input.doses))
  if (noted > 0 && noted < times.length) return { startsOn, firstDueOn: startsOn }
  const last = state.plans.flatMap((plan) => plan.steps).at(-1)
  const proposed =
    last === undefined
      ? startsOn
      : last.kind === 'move'
        ? last.dose.nextDueDate
        : shiftDate(referenceOf(last.dose), frequency, 1)
  return { startsOn, firstDueOn: proposed > startsOn ? proposed : startsOn }
}

export function treatmentSchedule(input: TreatmentScheduleInput): TreatmentSchedule {
  checkInput(input)
  const state = build(input)
  const currentPeriodId = state.plans.at(-1)?.period.id ?? null
  const staleDoseIds = state.plans.flatMap((plan) => plan.stale.map(({ id }) => id))
  const doses = mergeDoses(input.doses).filter(({ id }) => !staleDoseIds.includes(id))
  let known: Set<string> | undefined
  const knownOnce = () => (known ??= knownDues(state))
  return {
    phase: state.phase,
    finished:
      (state.phase === 'ended' || state.phase === 'stopped') && state.unloggedDoses.length === 0,
    currentDoses: state.currentDoses,
    nextDue:
      state.open === null
        ? null
        : (pendingDues(state.open, { from: nextDay(input.today), limit: 1 })[0] ?? null),
    unloggedDoses: state.unloggedDoses,
    doses,
    staleDoseIds,
    currentPeriodId,
    currentPeriodHasDose: doses.some((dose) => dose.periodId === currentPeriodId),
    upcoming: (limit) => upcoming(state, limit),
    dueForDate: (givenOn, time = null) => dueForDate(state, givenOn, time),
    doseFor: (gesture) => doseFor(state, knownOnce, gesture),
    redate: (doseId, givenOn) => redate(state, doseId, givenOn),
    move: (due, to) => move(state, due, to),
    moveBounds: (due) => {
      checkMovable(state, planOf(state, due.periodId), due)
      return moveBounds(state, due)
    },
    newPeriod: (frequency, times) => newPeriod(state, frequency, times),
  }
}
