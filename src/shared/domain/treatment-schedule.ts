import { addDays, addMonths, addWeeks, differenceInCalendarDays, formatISO } from 'date-fns'

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

export type TreatmentScheduleInput = {
  periods: readonly TreatmentPeriodInput[]
  doses: readonly TreatmentDoseInput[]
  /** `yyyy-MM-dd` : le module ne lit jamais l'horloge. */
  today: string
}

export type Due = { periodId: string; dueOn: string; dueTime: string | null }

export type TreatmentPhase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'

export type DoseGesture =
  | { kind: 'given'; due: Due; givenOn: string }
  | { kind: 'missed'; due: Due }
  | { kind: 'postponed'; due: Due; to: string }
  | { kind: 'redated'; doseId: string; givenOn: string }

export type DoseFields = Pick<
  TreatmentDoseInput,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

export type TreatmentSchedule = {
  phase: TreatmentPhase
  /** Fini ou arrêté sans rien à renseigner : il est dans « Traitements terminés ». */
  finished: boolean
  /** Doses du moment (TR-10) : chaque heure du jour sans prise, sinon la dernière en retard, sinon la prochaine. */
  currentDoses: Due[]
  /** Première échéance sans prise après aujourd'hui. */
  nextDue: Due | null
  /** Doses non renseignées (TR-13), jamais comptées comme des retards. */
  unloggedDoses: Due[]
  /** Une prise par échéance, la plus récemment modifiée, dans l'ordre des échéances. */
  doses: TreatmentDoseInput[]
  currentPeriodId: string | null
  /** TR-28 : une prise, même oubliée ou reportée, existe dans la période en cours. */
  currentPeriodHasDose: boolean
  /** Échéances sans prise à partir d'aujourd'hui inclus. */
  upcoming(limit: number): Due[]
  /** Échéance visée par une prise notée à cette date, à cette heure s'il y en a plusieurs. */
  dueForDate(givenOn: string, time?: string | null): Due | null
  /** Champs de la prise à écrire pour ce geste, prochaine échéance comprise. */
  doseFor(gesture: DoseGesture): DoseFields
  /** Première dose proposée pour une période ouverte par « Modifier ». */
  newPeriodFirstDue(frequency: Frequency): string
}

type Sequence = { origin: string; firstStep: number; floor: string }

type PeriodPlan = {
  period: TreatmentPeriodInput
  closesOn: string | null
  doses: TreatmentDoseInput[]
  anchors: { key: string; sequence: Sequence }[]
  between: Due[]
  covered: Set<string>
}

type Window = { from?: string; to?: string; limit?: number }

type DueEntry = { due: Due; status: DoseStatus | null }

type State = {
  input: TreatmentScheduleInput
  doses: TreatmentDoseInput[]
  plans: PeriodPlan[]
  open: PeriodPlan | null
  phase: TreatmentPhase
  currentDoses: Due[]
  unloggedDoses: Due[]
}

/** Bien plus rapide que `parseISO` et `format` : un calcul décale des milliers de dates. */
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

function sameDue(a: Due, b: Due): boolean {
  return a.periodId === b.periodId && keyOf(a) === keyOf(b)
}

function uniqueSorted(dues: Due[]): Due[] {
  const unique = new Map(dues.map((due) => [`${due.periodId} ${keyOf(due)}`, due]))
  return [...unique.values()].sort((a, b) => compareText(keyOf(a), keyOf(b)))
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
    const id = `${dose.periodId} ${keyOf(dose)}`
    const kept = latest.get(id)
    if (kept === undefined || isMoreRecent(dose, kept)) latest.set(id, dose)
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

/** Date d'où repart la suite (T1) : date réelle, échéance d'une oubliée, nouvelle date d'un report. */
function referenceOf(dose: TreatmentDoseInput): string {
  if (dose.status === 'postponed') return dose.nextDueDate
  return dose.status === 'given' && dose.givenOn !== null ? dose.givenOn : dose.dueOn
}

/** Un report qui ne tombe plus après la prise précédente ne fixe plus rien (TR-24 bis). */
function effectiveDoses(doses: TreatmentDoseInput[]): TreatmentDoseInput[] {
  const kept: TreatmentDoseInput[] = []
  for (const dose of doses) {
    const previous = kept.at(-1)
    const outdated =
      dose.status === 'postponed' &&
      previous !== undefined &&
      dose.nextDueDate <= referenceOf(previous)
    if (!outdated) kept.push(dose)
  }
  return kept
}

function initialSequence(period: TreatmentPeriodInput): Sequence {
  return { origin: period.firstDueOn, firstStep: 0, floor: '' }
}

/** En mois, la suite part de la date de référence quand elle redonne la prochaine échéance (T2). */
function sequenceAfter(
  dose: TreatmentDoseInput,
  frequency: Frequency,
  previousKey: string,
): Sequence {
  if (dose.status === 'postponed') {
    return { origin: dose.nextDueDate, firstStep: 0, floor: previousKey }
  }
  const reference = referenceOf(dose)
  const floor = keyOf(dose)
  return shiftDate(reference, frequency, 1) === dose.nextDueDate
    ? { origin: reference, firstStep: 1, floor }
    : { origin: dose.nextDueDate, firstStep: 0, floor }
}

function* sequenceDues(sequence: Sequence, period: TreatmentPeriodInput): Generator<Due, never> {
  const times = period.times.length > 0 ? [...period.times].sort() : [null]
  for (let step = sequence.firstStep; ; step += 1) {
    const dueOn = shiftDate(sequence.origin, period.frequency, step)
    for (const dueTime of times) {
      const due = { periodId: period.id, dueOn, dueTime }
      if (keyOf(due) > sequence.floor) yield due
    }
  }
}

function distanceInDays(a: string, b: string): number {
  return Math.abs(differenceInCalendarDays(toDate(a), toDate(b)))
}

/**
 * Échéances laissées sans prise avant celle-ci. Un report dont l'échéance a quitté la suite (prise
 * d'avant déplacée) remplace l'échéance la plus proche.
 */
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
  const effective = effectiveDoses(doses)
  const anchors: PeriodPlan['anchors'] = []
  const between: Due[] = []
  let sequence = initialSequence(period)
  let previousKey = ''
  for (const dose of effective) {
    between.push(...duesLeftBefore(dose, sequence, period))
    sequence = sequenceAfter(dose, period.frequency, previousKey)
    previousKey = keyOf(dose)
    anchors.push({ key: previousKey, sequence })
  }
  return {
    period,
    closesOn,
    doses: effective,
    anchors,
    between,
    covered: new Set(effective.map(keyOf)),
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

function tailSequence(plan: PeriodPlan): Sequence {
  return plan.anchors.at(-1)?.sequence ?? initialSequence(plan.period)
}

/** Une période ouverte sans date de fin est infinie : `to` ou `limit` la bornent. */
function pendingDues(plan: PeriodPlan, { from = '', to, limit = Infinity }: Window): Due[] {
  const isPending = (due: Due) =>
    isWithinPeriod(plan, due.dueOn) &&
    !plan.covered.has(keyOf(due)) &&
    due.dueOn >= from &&
    (to === undefined || due.dueOn <= to)
  const tail: Due[] = []
  for (const due of sequenceDues(tailSequence(plan), plan.period)) {
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
  const closed = { input, doses, plans, open: null, currentDoses: [] }

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
    input,
    doses,
    plans,
    open: current,
    phase: phaseOf(currentDoses[0], today),
    currentDoses,
    unloggedDoses: [...unlogged, ...missedHere],
  }
}

function planOf(state: State, periodId: string): PeriodPlan {
  const plan = state.plans.find(({ period }) => period.id === periodId)
  if (plan === undefined) throw new Error(`Période inconnue : ${periodId}`)
  return plan
}

/** Échéance suivant `due` dans la suite en vigueur à son moment, sans tenir compte des bornes. */
function nextInSequence(state: State, due: Due): string {
  const plan = planOf(state, due.periodId)
  const key = keyOf(due)
  const earlier = plan.anchors.filter((anchor) => anchor.key < key)
  const sequence = earlier.at(-1)?.sequence ?? initialSequence(plan.period)
  const dues = sequenceDues(sequence, plan.period)
  let next = dues.next().value
  while (keyOf(next) <= key) next = dues.next().value
  return next.dueOn
}

function stateWithout(input: TreatmentScheduleInput, due: Due): State {
  return build({ ...input, doses: input.doses.filter((dose) => !sameDue(dose, due)) })
}

function givenNextDueDate(input: TreatmentScheduleInput, due: Due, givenOn: string): string {
  const others = stateWithout(input, due)
  const coversCurrent = others.currentDoses.some((current) => sameDue(current, due))
  return coversCurrent && givenOn !== due.dueOn
    ? shiftDate(givenOn, planOf(others, due.periodId).period.frequency, 1)
    : nextInSequence(others, due)
}

function redatedDose(input: TreatmentScheduleInput, doseId: string, givenOn: string): DoseFields {
  const dose = mergeDoses(input.doses).find(({ id }) => id === doseId)
  if (dose?.status !== 'given' || dose.givenOn === null) {
    throw new Error(`Aucune prise donnée à redater : ${doseId}`)
  }
  const others = stateWithout(input, dose)
  const { frequency } = planOf(others, dose.periodId).period
  const nextFrom = (date: string) =>
    date === dose.dueOn ? nextInSequence(others, dose) : shiftDate(date, frequency, 1)
  const fixesItsOwnSuite = dose.nextDueDate === nextFrom(dose.givenOn)
  const { periodId, dueOn, dueTime } = dose
  return {
    periodId,
    dueOn,
    dueTime,
    givenOn,
    status: 'given',
    nextDueDate: fixesItsOwnSuite ? nextFrom(givenOn) : dose.nextDueDate,
  }
}

function doseFor(state: State, gesture: DoseGesture): DoseFields {
  if (gesture.kind === 'redated') return redatedDose(state.input, gesture.doseId, gesture.givenOn)
  const { due } = gesture
  switch (gesture.kind) {
    case 'given':
      return {
        ...due,
        givenOn: gesture.givenOn,
        status: 'given',
        nextDueDate: givenNextDueDate(state.input, due, gesture.givenOn),
      }
    case 'missed':
      return {
        ...due,
        givenOn: null,
        status: 'missed',
        nextDueDate: nextInSequence(stateWithout(state.input, due), due),
      }
    case 'postponed':
      return { ...due, givenOn: null, status: 'postponed', nextDueDate: gesture.to }
  }
}

function upcoming(state: State, limit: number): Due[] {
  return state.open === null ? [] : pendingDues(state.open, { from: state.input.today, limit })
}

function dueOf({ periodId, dueOn, dueTime }: Due): Due {
  return { periodId, dueOn, dueTime }
}

/** Échéances connues jusqu'à `through`, avec l'état de leur prise (`null` : sans prise). */
function entriesThrough(state: State, through: string): DueEntry[] {
  const { today } = state.input
  const pending = uniqueSorted([
    ...state.unloggedDoses,
    ...state.currentDoses,
    ...(state.open === null ? [] : pendingDues(state.open, { from: today, to: through })),
  ])
  const noted = state.plans.flatMap((plan) => plan.doses)
  return [
    ...pending.map((due) => ({ due, status: null })),
    ...noted.map((dose) => ({ due: dueOf(dose), status: dose.status })),
  ].sort((a, b) => compareText(keyOf(a.due), keyOf(b.due)))
}

/** Deux jours d'échéances suffisent à retrouver chaque heure, même si la première est notée. */
function firstPendingAfter(plan: PeriodPlan, day: string, time: string | null): Due | null {
  const perDay = Math.max(1, plan.period.times.length)
  const ahead = pendingDues(plan, { from: nextDay(day), limit: 2 * perDay })
  return ahead.find((due) => time === null || due.dueTime === time) ?? null
}

/** TR-13 : la dernière échéance tombée à cette date ou avant ; notée en avance, la prochaine. */
function dueForDate(state: State, date: string, time: string | null): Due | null {
  const through = date > state.input.today ? date : state.input.today
  const entries = entriesThrough(state, through).filter(
    ({ due }) => time === null || due.dueTime === time,
  )
  const last = entries.filter(({ due }) => due.dueOn <= date).at(-1)
  if (last !== undefined && (last.status === null || last.status === 'missed')) return last.due
  const ahead = entries.find(({ due, status }) => status === null && due.dueOn > date)
  if (ahead !== undefined) return ahead.due
  return state.open === null ? null : firstPendingAfter(state.open, through, time)
}

function newPeriodFirstDue(state: State, frequency: Frequency): string {
  const { today } = state.input
  const last = state.plans.flatMap((plan) => plan.doses).at(-1)
  if (last === undefined) return today
  const proposed =
    last.status === 'postponed' ? last.nextDueDate : shiftDate(referenceOf(last), frequency, 1)
  return proposed > today ? proposed : today
}

export function treatmentSchedule(input: TreatmentScheduleInput): TreatmentSchedule {
  const state = build(input)
  const { today } = input
  const currentPeriodId = state.plans.at(-1)?.period.id ?? null
  const { doses } = state
  return {
    phase: state.phase,
    finished:
      (state.phase === 'ended' || state.phase === 'stopped') && state.unloggedDoses.length === 0,
    currentDoses: state.currentDoses,
    nextDue:
      state.open === null
        ? null
        : (pendingDues(state.open, { from: nextDay(today), limit: 1 })[0] ?? null),
    unloggedDoses: state.unloggedDoses,
    doses,
    currentPeriodId,
    currentPeriodHasDose: doses.some((dose) => dose.periodId === currentPeriodId),
    upcoming: (limit) => upcoming(state, limit),
    dueForDate: (givenOn, time = null) => dueForDate(state, givenOn, time),
    doseFor: (gesture) => doseFor(state, gesture),
    newPeriodFirstDue: (frequency) => newPeriodFirstDue(state, frequency),
  }
}
