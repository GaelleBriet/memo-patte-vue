import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  formatISO,
} from 'date-fns'

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
  | { kind: 'given'; due: Due; givenOn: string }
  | { kind: 'missed'; due: Due }
  | { kind: 'postponed'; due: Due; to: string }

export type DoseFields = Pick<
  TreatmentDoseInput,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** `postponement` : les déplacements de la dose suivante (TR-9) ; non gardés, ils sont à supprimer. */
export type RedatedDose = {
  dose: DoseFields
  postponement: { doseIds: string[]; kept: boolean } | null
}

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
  /** Prises en vigueur, une par échéance (la plus récemment modifiée) ; sans les reports dépassés. */
  doses: TreatmentDoseInput[]
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
  /** Première dose proposée pour une période ouverte par « Modifier ». */
  newPeriodFirstDue(frequency: Frequency): string
}

type Sequence = { origin: string; firstStep: number; floor: string }

type Note = { kind: 'note'; dose: TreatmentDoseInput; position: string }

type Move = {
  kind: 'move'
  first: TreatmentDoseInput
  doses: TreatmentDoseInput[]
  to: string
  position: string
}

type Step = Note | Move

type PeriodPlan = {
  period: TreatmentPeriodInput
  closesOn: string | null
  steps: Step[]
  doses: TreatmentDoseInput[]
  overtaken: TreatmentDoseInput[]
  anchors: { position: string; sequence: Sequence }[]
  between: Due[]
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

function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = toDate(day)
  return (
    date.getFullYear() === Number(day.slice(0, 4)) &&
    date.getMonth() === Number(day.slice(5, 7)) - 1 &&
    date.getDate() === Number(day.slice(8, 10))
  )
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

function estimatedDues(period: TreatmentPeriodInput, doses: TreatmentDoseInput[], today: string) {
  const days = [
    period.firstDueOn,
    today,
    ...doses.map((dose) => dose.dueOn),
    ...doses.filter((dose) => dose.status === 'postponed').map((dose) => dose.nextDueDate),
  ].sort(compareText)
  const span = differenceInCalendarDays(toDate(days.at(-1) ?? today), toDate(days[0] ?? today))
  const stepDays = DAYS_PER_STEP[period.frequency.unit] * period.frequency.value
  const perDay = Math.max(1, period.times.length)
  return (Math.floor(span / stepDays) + 2) * perDay + doses.length * (perDay + 1)
}

function checkInput({ periods, doses, today }: TreatmentScheduleInput): void {
  checkDay(today, 'today')
  periods.forEach(checkPeriod)
  doses.forEach(checkDose)
  const total = periods.reduce(
    (sum, period) =>
      sum +
      estimatedDues(
        period,
        doses.filter((dose) => dose.periodId === period.id),
        today,
      ),
    0,
  )
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

// Déplacer de nouveau une dose déjà déplacée prolonge le même déplacement.
function movesOf(postponed: TreatmentDoseInput[]): Move[] {
  const moves: Move[] = []
  const byDestination = new Map<string, Move>()
  for (const dose of [...postponed].sort(compareCreation)) {
    const chained = byDestination.get(dose.dueOn)
    const move: Move = chained ?? { kind: 'move', first: dose, doses: [], to: '', position: '' }
    if (chained === undefined) moves.push(move)
    else byDestination.delete(dose.dueOn)
    move.doses.push(dose)
    move.to = dose.nextDueDate
    byDestination.set(move.to, move)
  }
  // Avancé (Q17), un déplacement agit à sa nouvelle date, avant l'échéance qu'il remplace.
  return moves.map((move) => {
    const replaced = keyOf(move.first)
    const arrival = `${move.to} `
    return { ...move, position: positionOf(arrival < replaced ? arrival : replaced, 0) }
  })
}

function stepsOf(doses: TreatmentDoseInput[]): Step[] {
  const notes: Step[] = doses
    .filter((dose) => dose.status !== 'postponed')
    .map((dose) => ({ kind: 'note', dose, position: positionOf(keyOf(dose), 1) }))
  const moves = movesOf(doses.filter((dose) => dose.status === 'postponed'))
  const firstDose = (step: Step) => (step.kind === 'note' ? step.dose : step.first)
  return [...notes, ...moves].sort(
    (a, b) => compareText(a.position, b.position) || compareCreation(firstDose(a), firstDose(b)),
  )
}

function stepDoses(step: Step): TreatmentDoseInput[] {
  return step.kind === 'note' ? [step.dose] : step.doses
}

function splitOvertaken(steps: Step[], frequency: Frequency) {
  const kept: Step[] = []
  const overtaken: TreatmentDoseInput[] = []
  for (const step of steps) {
    const previous = kept.at(-1)
    const isOvertaken =
      step.kind === 'move' &&
      previous?.kind === 'note' &&
      fixesSuiteFromItsDate(previous.dose, frequency) &&
      step.to <= referenceOf(previous.dose)
    if (isOvertaken) overtaken.push(...step.doses)
    else kept.push(step)
  }
  return { kept, overtaken }
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

function sequenceAfter(step: Step, period: TreatmentPeriodInput, current: Sequence): Sequence {
  if (step.kind === 'move') return { origin: step.to, firstStep: 0, floor: current.floor }
  const { dose } = step
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

function duesLeftBefore(step: Step, sequence: Sequence, period: TreatmentPeriodInput): Due[] {
  const replaced = step.kind === 'note' ? step.dose : step.first
  const key = keyOf(replaced)
  const before: Due[] = []
  let after: Due | undefined
  for (const due of sequenceDues(sequence, period)) {
    if (keyOf(due) > key) {
      after = due
      break
    }
    before.push(due)
  }
  const last = before.at(-1)
  if (last === undefined) return before
  // Prise d'avant déplacée : le report remplace l'échéance de la suite la plus proche de la sienne.
  const isReplaced =
    keyOf(last) === key ||
    (step.kind === 'move' &&
      (after === undefined ||
        distanceInDays(last.dueOn, replaced.dueOn) <= distanceInDays(after.dueOn, replaced.dueOn)))
  return isReplaced ? before.slice(0, -1) : before
}

function planPeriod(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
): PeriodPlan {
  const { kept, overtaken } = splitOvertaken(stepsOf(doses), period.frequency)
  const anchors: PeriodPlan['anchors'] = []
  const between: Due[] = []
  let sequence = initialSequence(period)
  for (const step of kept) {
    between.push(...duesLeftBefore(step, sequence, period))
    sequence = sequenceAfter(step, period, sequence)
    anchors.push({ position: step.position, sequence })
  }
  const keptDoses = kept.flatMap(stepDoses).sort(compareDoses)
  const fallenKeys = keptDoses.filter((dose) => !isAdvanced(dose)).map(keyOf)
  const covered = new Set(keptDoses.map(keyOf))
  return {
    period,
    closesOn,
    steps: kept,
    doses: keptDoses,
    overtaken,
    anchors,
    between,
    covered,
    fallenKeys,
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

function dosesOfTheMoment(plan: PeriodPlan, fallen: Due[], today: string): Due[] {
  const ofToday = fallen.filter((due) => due.dueOn === today)
  if (ofToday.length > 0) return ofToday
  const latest = fallen.at(-1)
  if (latest !== undefined && keyOf(latest) > latestFallenKey(plan, today)) return [latest]
  return pendingDues(plan, { from: nextDay(today), limit: 1 })
}

function phaseOf(current: Due | undefined, today: string): TreatmentPhase {
  if (current === undefined) return 'ended'
  if (current.dueOn === today) return 'today'
  return current.dueOn < today ? 'overdue' : 'upcoming'
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
    ),
  )
  const current = plans.at(-1)
  const unlogged = plans
    .slice(0, -1)
    .flatMap((plan) => pendingDues(plan, { to: previousDay(today) }))
  const noted = new Set(doses.map(dueId))
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

function stateWithout(state: State, due: Due, today = state.input.today): State {
  if (!state.noted.has(dueId(due)) && today === state.input.today) return state
  const doses = state.input.doses.filter((dose) => !sameDue(dose, due))
  return build({ ...state.input, doses, today })
}

function givenNextDueDate(others: State, due: Due, givenOn: string): string {
  const coversCurrent = others.currentDoses.some((current) => sameDue(current, due))
  return coversCurrent && givenOn !== due.dueOn
    ? shiftDate(givenOn, planOf(others, due.periodId).period.frequency, 1)
    : nextInSequence(others, due)
}

// Une prise en avance vise le prochain jour d'échéance : deux jours couvrent chaque heure.
function nearUpcoming(open: PeriodPlan, today: string): Due[] {
  const perDay = Math.max(1, open.period.times.length)
  return pendingDues(open, { from: nextDay(today), limit: 2 * perDay })
}

function knownDues(state: State): Set<string> {
  const upcoming = state.open === null ? [] : nearUpcoming(state.open, state.input.today)
  const pending = [...state.unloggedDoses, ...state.currentDoses, ...upcoming]
  return new Set([...state.noted, ...pending.map(dueId)])
}

function doseFor(state: State, known: () => Set<string>, gesture: DoseGesture): DoseFields {
  const { due } = gesture
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
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
    case 'postponed':
      checkDay(gesture.to, 'nouvelle date')
      if (gesture.to < state.input.today) throw invalid(`nouvelle date ${gesture.to} : date passée`)
      return { ...dueOf(due), givenOn: null, status: 'postponed', nextDueDate: gesture.to }
  }
}

function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  for (const plan of state.plans) {
    const index = plan.steps.findIndex((step) => step.kind === 'note' && step.dose.id === doseId)
    const step = plan.steps[index]
    if (step?.kind !== 'note' || step.dose.status !== 'given') continue
    const { dose } = step
    const next = plan.steps[index + 1]
    const postponement =
      next?.kind === 'move'
        ? { doseIds: next.doses.map(({ id }) => id), kept: next.to > givenOn }
        : null
    const nextDueDate =
      postponement?.kept === false
        ? shiftDate(givenOn, plan.period.frequency, 1)
        : givenNextDueDate(stateWithout(state, dose, givenOn), dose, givenOn)
    return { dose: { ...dueOf(dose), givenOn, status: 'given', nextDueDate }, postponement }
  }
  throw new RangeError(`Aucune prise donnée à redater : ${doseId}`)
}

function upcoming(state: State, limit: number): Due[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DUES) throw invalid(`upcoming(${limit})`)
  return state.open === null ? [] : pendingDues(state.open, { from: state.input.today, limit })
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
      .flatMap((plan) => plan.doses)
      .map((dose) => ({ due: dueOf(dose), status: dose.status })),
  ]
    .filter(({ due }) => matches(due))
    .sort((a, b) => compareText(keyOf(a.due), keyOf(b.due)))
  const last = entries.filter(({ due }) => due.dueOn <= date).at(-1)
  if (last !== undefined && (last.status === null || last.status === 'missed')) return last.due
  const ahead = entries.find(({ due, status }) => status === null && due.dueOn > date)
  if (ahead !== undefined) return ahead.due
  return state.open === null ? null : (nearUpcoming(state.open, today).find(matches) ?? null)
}

function newPeriodFirstDue(state: State, frequency: Frequency): string {
  checkFrequency(frequency, '')
  const { today } = state.input
  const last = state.plans.flatMap((plan) => plan.steps).at(-1)
  if (last === undefined) return today
  const proposed = last.kind === 'move' ? last.to : shiftDate(referenceOf(last.dose), frequency, 1)
  return proposed > today ? proposed : today
}

export function treatmentSchedule(input: TreatmentScheduleInput): TreatmentSchedule {
  checkInput(input)
  const state = build(input)
  const currentPeriodId = state.plans.at(-1)?.period.id ?? null
  const overtaken = new Set(state.plans.flatMap((plan) => plan.overtaken.map(({ id }) => id)))
  const doses = mergeDoses(input.doses).filter(({ id }) => !overtaken.has(id))
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
    currentPeriodId,
    currentPeriodHasDose: doses.some((dose) => dose.periodId === currentPeriodId),
    upcoming: (limit) => upcoming(state, limit),
    dueForDate: (givenOn, time = null) => dueForDate(state, givenOn, time),
    doseFor: (gesture) => doseFor(state, knownOnce, gesture),
    redate: (doseId, givenOn) => redate(state, doseId, givenOn),
    newPeriodFirstDue: (frequency) => newPeriodFirstDue(state, frequency),
  }
}
