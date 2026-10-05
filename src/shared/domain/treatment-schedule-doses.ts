import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { isClockTime } from './clock-time'
import { MAX_DUES, checkPastDay, invalid } from './treatment-schedule-checks'
import {
  DAYS_PER_STEP,
  compareText,
  dueId,
  dueOf,
  keyOf,
  latestOf,
  sameDue,
  shiftDate,
  toDate,
  uniqueSorted,
} from './treatment-schedule-dues'
import { isLocked, movedFields, shiftFields } from './treatment-schedule-moves'
import {
  compareCreation,
  hasFallen,
  notesOf,
  pendingDues,
  positionOf,
  sequenceAt,
  shiftOn,
} from './treatment-schedule-plan'
import { firstDueOf, shiftedSequence } from './treatment-schedule-sequence'
import {
  build,
  knownDues,
  nearUpcoming,
  nextInSequence,
  planOf,
  stateWithout,
  stateWithoutNote,
} from './treatment-schedule-state'
import type {
  DoseFields,
  DoseGesture,
  Due,
  DueEntry,
  Frequency,
  LineChange,
  NotedDose,
  PeriodPlan,
  RedatedDose,
  State,
  TreatmentDoseInput,
} from './treatment-schedule-types'

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

// Le rythme ancré à la date réelle ne retombe jamais sur le jour d'origine ni le jour d'arrivée d'un
// report qui suit ; une heure plus tardive reportée garde la main sur sa journée.
function hitsAMove(
  plan: PeriodPlan,
  due: Due,
  givenOn: string,
  except: TreatmentDoseInput | null = null,
): boolean {
  const { frequency } = plan.period
  return plan.steps.some(
    ({ kind, dose }) =>
      kind === 'move' &&
      dose !== except &&
      (dose.dueOn === due.dueOn
        ? keyOf(dose) > keyOf(due)
        : dose.dueOn > due.dueOn &&
          (landsOn(givenOn, dose.dueOn, frequency) ||
            landsOn(givenOn, dose.nextDueDate, frequency))),
  )
}

// La suite ne repart de la date réelle (T2) que pour la dose du moment, à la dernière heure du jour,
// si la dose suivante tombe après l'échéance couverte.
function restartsFrom(others: State, due: Due, givenOn: string, next: string): boolean {
  const plan = planOf(others, due.periodId)
  const { frequency } = plan.period
  const dayIsComplete = () =>
    pendingDues(plan, { from: due.dueOn, to: due.dueOn }).every((other) => sameDue(other, due))
  return (
    givenOn !== due.dueOn &&
    next !== due.dueOn &&
    shiftDate(givenOn, frequency, 1) > due.dueOn &&
    others.currentDoses.some((current) => sameDue(current, due)) &&
    dayIsComplete() &&
    !hitsAMove(plan, due, givenOn)
  )
}

// La première dose du rythme ancré à la date réelle, après la journée de la prise.
function restartedOn(plan: PeriodPlan, due: Due, givenOn: string): string {
  return firstDueOf({ origin: givenOn, firstStep: 1, floor: `${due.dueOn} ~` }, plan.period).dueOn
}

type Written = { id: string | null; fields: DoseFields | null }

// La prochaine échéance que le calendrier montrera une fois ces lignes écrites (`fields` nul : supprimée).
function nextAfter(state: State, due: Due, written: Written[]): string {
  const at = '9999-12-31T23:59:59.999Z'
  const touched = new Set(written.map(({ id }) => id))
  const doses = [
    ...state.input.doses.filter(({ id }) => !touched.has(id)),
    ...written.flatMap(({ id, fields }, index) =>
      fields === null
        ? []
        : [{ ...fields, id: id ?? `écrite-${index}`, createdAt: at, updatedAt: at }],
    ),
  ]
  return nextInSequence(build({ ...state.input, doses }), due)
}

function checkKnown(known: () => Set<string>, due: Due): void {
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

// Une prise un intervalle ou plus avant sa dose est une prise en plus, si elle suit toutes les lignes
// de sa période et ne laisse derrière elle aucune dose à donner ; à plusieurs heures, l'heure reste (G10).
function isExtra(state: State, due: Due, givenOn: string): boolean {
  const plan = planOf(state, due.periodId)
  const { frequency, times, startsOn } = plan.period
  const lineDay = ({ dose }: PeriodPlan['steps'][number]) =>
    latestOf([dose.dueOn, dose.givenOn, dose.status === 'postponed' ? dose.nextDueDate : null])
  return (
    plan === state.open &&
    times.length <= 1 &&
    shiftDate(givenOn, frequency, 1) <= due.dueOn &&
    (state.plans[0] === plan || givenOn >= startsOn) &&
    plan.steps.every((step) => step.kind === 'shift' || (lineDay(step) ?? '') <= givenOn) &&
    state.unloggedDoses.every((unlogged) => unlogged.dueOn <= givenOn) &&
    state.currentDoses.every((current) => current.dueOn > givenOn)
  )
}

function extraFor(state: State, due: Due, givenOn: string): NotedDose {
  const extraDue = { periodId: due.periodId, dueOn: givenOn, dueTime: due.dueTime }
  const existing = planOf(state, due.periodId).steps.find(
    ({ kind, dose }) => kind === 'extra' && sameDue(dose, extraDue),
  )
  const dose: DoseFields = { ...extraDue, givenOn, status: 'extra', nextDueDate: givenOn }
  const nextDueDate = nextAfter(state, extraDue, [{ id: existing?.dose.id ?? null, fields: dose }])
  return { dose: { ...dose, nextDueDate }, shift: null }
}

export function doseFor(state: State, known: () => Set<string>, gesture: DoseGesture): NotedDose {
  const { due } = gesture
  checkKnown(known, due)
  const others = stateWithoutNote(state, due)
  const next = nextInSequence(others, due)
  switch (gesture.kind) {
    case 'given': {
      const { givenOn } = gesture
      checkPastDay(givenOn, state.input.today, 'date réelle')
      if (isExtra(others, due, givenOn)) return extraFor(others, due, givenOn)
      const restarts = restartsFrom(others, due, givenOn, next)
      const shift = restarts ? shiftFields(due, givenOn) : null
      const dose: DoseFields = { ...dueOf(due), givenOn, status: 'given', nextDueDate: next }
      if (shift === null) return { dose, shift }
      const nextDueDate = nextAfter(others, due, [
        { id: null, fields: dose },
        { id: shiftOn(planOf(others, due.periodId), due)?.id ?? null, fields: shift },
      ])
      return { dose: { ...dose, nextDueDate }, shift }
    }
    case 'missed':
      return {
        dose: { ...dueOf(due), givenOn: null, status: 'missed', nextDueDate: next },
        shift: null,
      }
  }
}

// TR-24 bis ne vaut que pour une prise qui décale la suite, avant le report qui suit sa journée.
function followingMove(
  plan: PeriodPlan,
  dose: TreatmentDoseInput,
  shift: TreatmentDoseInput | undefined,
): TreatmentDoseInput | null {
  const dayEnd = positionOf(`${dose.dueOn} ~`, 1)
  const next = plan.steps.find((step) => step.kind !== 'shift' && step.position > dayEnd)
  if (next?.kind !== 'move' || compareCreation(dose, next.dose) > 0) return null
  const suite =
    shift === undefined
      ? { ...sequenceAt(plan, dayEnd), floor: `${dose.dueOn} ~` }
      : shiftedSequence(shift)
  return keyOf(firstDueOf(suite, plan.period)) === keyOf(next.dose) ? next.dose : null
}

function fieldsOf(dose: TreatmentDoseInput): DoseFields {
  const { givenOn, status, nextDueDate } = dose
  return { ...dueOf(dose), givenOn, status, nextDueDate }
}

function shiftChange(shift: TreatmentDoseInput | undefined, wanted: DoseFields | null): LineChange {
  if (wanted === null)
    return shift === undefined ? { action: 'none' } : { action: 'delete', doseId: shift.id }
  return shift === undefined
    ? { action: 'create', dose: wanted }
    : { action: 'rewrite', dose: wanted, doseId: shift.id }
}

function lineWritten(change: LineChange): Written[] {
  switch (change.action) {
    case 'none':
      return []
    case 'create':
      return [{ id: null, fields: change.dose }]
    case 'rewrite':
      return [{ id: change.doseId, fields: change.dose }]
    case 'delete':
      return [{ id: change.doseId, fields: null }]
  }
}

// TR-24 bis : le report qui suit la prise redatée est gardé, réécrit pour viser la dose qu'elle fixe, ou dépassé.
function postponementAfter(
  plan: PeriodPlan,
  dose: TreatmentDoseInput,
  shift: TreatmentDoseInput | undefined,
  shifts: boolean,
  givenOn: string,
  restartsOn: string,
): RedatedDose['postponement'] {
  const following = shift !== undefined || shifts ? followingMove(plan, dose, shift) : null
  const move = following !== null && isLocked(plan, following) ? null : following
  if (move === null) return null
  const moveShift = shiftOn(plan, move)
  const moveShiftIds = moveShift === undefined ? [] : [moveShift.id]
  if (move.nextDueDate <= givenOn) return { doseIds: [move.id, ...moveShiftIds], kept: false }
  const firstTime = [...plan.period.times].sort(compareText)[0] ?? null
  const followed = { periodId: dose.periodId, dueOn: restartsOn, dueTime: firstTime }
  // Suivi d'une autre ligne, le report garde son échéance : la suite d'après pourrait retomber dessus.
  const lastLine = plan.steps.filter((step) => step.kind !== 'shift').at(-1)?.dose
  const isPending = !plan.noteDays.has(move.nextDueDate) && lastLine === move
  const target = shifts && isPending ? followed : dueOf(move)
  return {
    doseIds: [move.id],
    kept: true,
    line: movedFields(target, move.nextDueDate),
    shiftIds: moveShiftIds,
    shiftLine: shiftFields(target, move.nextDueDate),
  }
}

// Une prise en plus redatée est notée de nouveau à cette date, sans elle : elle vise ce que viserait
// une prise notée ce jour-là, et peut redevenir la prise de la dose prévue.
function redateExtra(state: State, extra: TreatmentDoseInput, givenOn: string): RedatedDose {
  const none = { action: 'none' } as const
  if (givenOn === extra.givenOn) return { dose: fieldsOf(extra), shift: none, postponement: null }
  const doses = state.input.doses.filter(
    (dose) => !(dose.status === 'extra' && sameDue(dose, extra)),
  )
  const others = build({ ...state.input, doses })
  const due = dueForDate(others, givenOn, null)
  if (due === null) throw new RangeError(`Aucune dose à viser le ${givenOn}`)
  const noted = doseFor(others, () => knownDues(others), { kind: 'given', due, givenOn })
  const shift =
    noted.shift === null
      ? none
      : shiftChange(shiftOn(planOf(others, due.periodId), due), noted.shift)
  return { dose: noted.dose, shift, postponement: null }
}

// N2 : une prise qui a décalé la suite la décale encore, depuis sa nouvelle date ; une autre se
// recalcule comme notée ce jour-là, sur le carnet d'aujourd'hui (une dose non renseignée ne décale rien).
export function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  for (const plan of state.plans) {
    const extra = plan.steps.find(({ kind, dose }) => kind === 'extra' && dose.id === doseId)
    if (extra !== undefined) return redateExtra(state, extra.dose, givenOn)
    const dose = notesOf(plan).find((note) => note.id === doseId)
    if (dose?.status !== 'given') continue
    if (givenOn === dose.givenOn) {
      return { dose: fieldsOf(dose), shift: { action: 'none' }, postponement: null }
    }
    const shift = shiftOn(plan, dose)
    const others = stateWithout(state, dose)
    const next = nextInSequence(others, dose)
    const followingOfShift = shift === undefined ? null : followingMove(plan, dose, shift)
    // Le décalage reste tel quel quand le rythme de la nouvelle date retomberait sur un report.
    const keepsShift =
      shift !== undefined &&
      givenOn !== dose.dueOn &&
      hitsAMove(planOf(others, dose.periodId), dose, givenOn, followingOfShift)
    const shifts =
      shift === undefined
        ? restartsFrom(others, dose, givenOn, next)
        : givenOn !== dose.dueOn && !keepsShift
    const restartsOn = shifts ? restartedOn(plan, dose, givenOn) : next
    const shiftLine = keepsShift
      ? ({ action: 'none' } as const)
      : shiftChange(shift, shifts ? shiftFields(dose, givenOn) : null)
    const postponement = postponementAfter(plan, dose, shift, shifts, givenOn, restartsOn)
    const fields: DoseFields = { ...dueOf(dose), givenOn, status: 'given', nextDueDate: next }
    const written: Written[] = [
      { id: dose.id, fields },
      ...lineWritten(shiftLine),
      ...(postponement === null
        ? []
        : postponement.kept
          ? [
              ...postponement.doseIds.map((id) => ({ id, fields: postponement.line })),
              ...postponement.shiftIds.map((id) => ({ id, fields: postponement.shiftLine })),
            ]
          : postponement.doseIds.map((id) => ({ id, fields: null }))),
    ]
    const nextDueDate = nextAfter(state, dose, written)
    return { dose: { ...fields, nextDueDate }, shift: shiftLine, postponement }
  }
  throw new RangeError(`Aucune prise donnée ni prise en plus à redater : ${doseId}`)
}

export function upcoming(state: State, limit: number): Due[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DUES) throw invalid(`upcoming(${limit})`)
  const { open, input } = state
  return open === null ? [] : pendingDues(open, { from: input.today, limit })
}

export function dueForDate(state: State, date: string, time: string | null): Due | null {
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
