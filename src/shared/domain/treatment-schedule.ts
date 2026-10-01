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

/** `postponement` : le report placé juste après la prise ; non gardé, il est à supprimer. */
export type RedatedDose = {
  dose: DoseFields
  postponement: { doseId: string; kept: boolean } | null
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

type PeriodPlan = {
  period: TreatmentPeriodInput
  closesOn: string | null
  doses: TreatmentDoseInput[]
  overtaken: TreatmentDoseInput[]
  anchors: { key: string; sequence: Sequence }[]
  between: Due[]
  covered: Set<string>
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

function referenceOf(dose: TreatmentDoseInput): string {
  if (dose.status === 'postponed') return dose.nextDueDate
  return dose.status === 'given' && dose.givenOn !== null ? dose.givenOn : dose.dueOn
}

function fixesSuiteFromItsDate(dose: TreatmentDoseInput, frequency: Frequency): boolean {
  return (
    dose.status === 'postponed' || shiftDate(referenceOf(dose), frequency, 1) === dose.nextDueDate
  )
}

function splitOvertaken(doses: TreatmentDoseInput[], frequency: Frequency) {
  const kept: TreatmentDoseInput[] = []
  const overtaken: TreatmentDoseInput[] = []
  for (const dose of doses) {
    const previous = kept.at(-1)
    const isOvertaken =
      dose.status === 'postponed' &&
      previous !== undefined &&
      fixesSuiteFromItsDate(previous, frequency) &&
      dose.nextDueDate <= referenceOf(previous)
    if (isOvertaken) overtaken.push(dose)
    else kept.push(dose)
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

function sequenceAfter(
  dose: TreatmentDoseInput,
  period: TreatmentPeriodInput,
  current: Sequence,
  previousKey: string,
): Sequence {
  if (dose.status === 'postponed') {
    return { origin: dose.nextDueDate, firstStep: 0, floor: previousKey }
  }
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

function duesLeftBefore(
  dose: TreatmentDoseInput,
  sequence: Sequence,
  period: TreatmentPeriodInput,
): Due[] {
  const key = keyOf(dose)
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
  const replaced =
    keyOf(last) === key ||
    (dose.status === 'postponed' &&
      (after === undefined ||
        distanceInDays(last.dueOn, dose.dueOn) <= distanceInDays(after.dueOn, dose.dueOn)))
  return replaced ? before.slice(0, -1) : before
}

function planPeriod(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
): PeriodPlan {
  const { kept, overtaken } = splitOvertaken(doses, period.frequency)
  const anchors: PeriodPlan['anchors'] = []
  const between: Due[] = []
  let sequence = initialSequence(period)
  let previousKey = ''
  for (const dose of kept) {
    between.push(...duesLeftBefore(dose, sequence, period))
    sequence = sequenceAfter(dose, period, sequence, previousKey)
    previousKey = keyOf(dose)
    anchors.push({ key: previousKey, sequence })
  }
  const covered = new Set(kept.map(keyOf))
  return { period, closesOn, doses: kept, overtaken, anchors, between, covered }
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

function sequenceAt(plan: PeriodPlan, key: string): Sequence {
  let low = 0
  let high = plan.anchors.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((plan.anchors[middle]?.key ?? key) < key) low = middle + 1
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

function latestNotedKey(plan: PeriodPlan, today: string): string {
  const latest = plan.doses.filter((dose) => dose.dueOn <= today).at(-1)
  return latest === undefined ? '' : keyOf(latest)
}

function dosesOfTheMoment(plan: PeriodPlan, fallen: Due[], today: string): Due[] {
  const ofToday = fallen.filter((due) => due.dueOn === today)
  if (ofToday.length > 0) return ofToday
  const latest = fallen.at(-1)
  if (latest !== undefined && keyOf(latest) > latestNotedKey(plan, today)) return [latest]
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
  const dues = sequenceDues(sequenceAt(plan, key), plan.period, due.dueOn)
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
      checkDay(gesture.to, 'report')
      return { ...dueOf(due), givenOn: null, status: 'postponed', nextDueDate: gesture.to }
  }
}

function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  const doses = mergeDoses(state.input.doses)
  const index = doses.findIndex(({ id }) => id === doseId)
  const dose = doses[index]
  if (dose?.status !== 'given') throw new RangeError(`Aucune prise donnée à redater : ${doseId}`)
  const next = doses.slice(index + 1).find(({ periodId }) => periodId === dose.periodId)
  const postponement =
    next?.status === 'postponed' ? { doseId: next.id, kept: next.nextDueDate > givenOn } : null
  const { frequency } = planOf(state, dose.periodId).period
  const nextDueDate =
    postponement?.kept === false
      ? shiftDate(givenOn, frequency, 1)
      : givenNextDueDate(stateWithout(state, dose, givenOn), dose, givenOn)
  return { dose: { ...dueOf(dose), givenOn, status: 'given', nextDueDate }, postponement }
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
  const last = state.plans.flatMap((plan) => plan.doses).at(-1)
  if (last === undefined) return today
  const proposed =
    last.status === 'postponed' ? last.nextDueDate : shiftDate(referenceOf(last), frequency, 1)
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
