import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { isClockTime } from './clock-time'
import { MAX_DUES, checkPastDay, invalid } from './treatment-schedule-checks'
import {
  DAYS_PER_STEP,
  compareText,
  dueId,
  dueOf,
  keyOf,
  sameDue,
  shiftDate,
  toDate,
  uniqueSorted,
} from './treatment-schedule-dues'
import { isLocked, movedFields, shiftFields } from './treatment-schedule-moves'
import {
  compareCreation,
  familyOf,
  hasFallen,
  notesOf,
  pendingDues,
  positionOf,
  sequenceAt,
  shiftOn,
  type Family,
} from './treatment-schedule-plan'
import { firstDueOf, shiftedSequence } from './treatment-schedule-sequence'
import { nearUpcoming, nextInSequence, planOf, stateWithout } from './treatment-schedule-state'
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

// La suite ne repart de la date réelle (T2) que pour la dose du moment, à la dernière heure du jour
// (une heure plus tardive reportée garde la main), si la dose suivante tombe après l'échéance
// couverte, et jamais sur l'échéance d'origine d'un report.
function restartsFrom(others: State, due: Due, givenOn: string, next: string): boolean {
  const plan = planOf(others, due.periodId)
  const { frequency } = plan.period
  const hitsAMove = () =>
    plan.steps.some(
      ({ kind, dose }) =>
        kind === 'move' &&
        (dose.dueOn === due.dueOn
          ? keyOf(dose) > keyOf(due)
          : dose.dueOn > due.dueOn && landsOn(givenOn, dose.dueOn, frequency)),
    )
  const dayIsComplete = () =>
    pendingDues(plan, { from: due.dueOn, to: due.dueOn }).every((other) => sameDue(other, due))
  return (
    givenOn !== due.dueOn &&
    next !== due.dueOn &&
    shiftDate(givenOn, frequency, 1) > due.dueOn &&
    others.currentDoses.some((current) => sameDue(current, due)) &&
    dayIsComplete() &&
    !hitsAMove()
  )
}

function checkKnown(known: () => Set<string>, due: Due): void {
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

export function doseFor(state: State, known: () => Set<string>, gesture: DoseGesture): NotedDose {
  const { due } = gesture
  checkKnown(known, due)
  const others = stateWithout(state, due)
  const next = nextInSequence(others, due)
  switch (gesture.kind) {
    case 'given': {
      const { givenOn } = gesture
      checkPastDay(givenOn, state.input.today, 'date réelle')
      const restarts = restartsFrom(others, due, givenOn, next)
      const { frequency } = planOf(others, due.periodId).period
      return {
        dose: {
          ...dueOf(due),
          givenOn,
          status: 'given',
          nextDueDate: restarts ? shiftDate(givenOn, frequency, 1) : next,
        },
        shift: restarts ? shiftFields(due, givenOn) : null,
      }
    }
    case 'missed':
      return {
        dose: { ...dueOf(due), givenOn: null, status: 'missed', nextDueDate: next },
        shift: null,
      }
  }
}

function sameDueLines(state: State, line: TreatmentDoseInput, family: Family): string[] {
  return state.input.doses
    .filter((dose) => sameDue(dose, line) && familyOf(dose) === family)
    .map(({ id }) => id)
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

// N2 : une prise qui a décalé la suite la décale encore, depuis sa nouvelle date ; une autre se
// recalcule comme notée ce jour-là, sur le carnet d'aujourd'hui (une dose non renseignée ne décale rien).
export function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  for (const plan of state.plans) {
    const dose = notesOf(plan).find((note) => note.id === doseId)
    if (dose?.status !== 'given') continue
    if (givenOn === dose.givenOn) {
      return { dose: fieldsOf(dose), shift: { action: 'none' }, postponement: null }
    }
    const { frequency } = plan.period
    const shift = shiftOn(plan, dose)
    const others = stateWithout(state, dose)
    const next = nextInSequence(others, dose)
    const shifts =
      shift === undefined ? restartsFrom(others, dose, givenOn, next) : givenOn !== dose.dueOn
    const nextDueDate = shifts ? shiftDate(givenOn, frequency, 1) : next
    const fields: DoseFields = { ...dueOf(dose), givenOn, status: 'given', nextDueDate }
    const redated = {
      dose: fields,
      shift: shiftChange(shift, shifts ? shiftFields(dose, givenOn) : null),
    }
    const following = shift === undefined && !shifts ? null : followingMove(plan, dose, shift)
    const move = following !== null && isLocked(plan, following) ? null : following
    if (move === null) return { ...redated, postponement: null }
    const moveIds = sameDueLines(state, move, 'move')
    const moveShiftIds = sameDueLines(state, move, 'shift')
    if (move.nextDueDate <= givenOn) {
      return { ...redated, postponement: { doseIds: [...moveIds, ...moveShiftIds], kept: false } }
    }
    const firstTime = [...plan.period.times].sort(compareText)[0] ?? null
    const followed = { periodId: dose.periodId, dueOn: nextDueDate, dueTime: firstTime }
    // Suivi d'une autre ligne, le report garde son échéance : la suite d'après pourrait retomber dessus.
    const lastLine = plan.steps.filter((step) => step.kind !== 'shift').at(-1)?.dose
    const isPending = !plan.noteDays.has(move.nextDueDate) && lastLine === move
    const target = shifts && isPending ? followed : dueOf(move)
    return {
      ...redated,
      postponement: {
        doseIds: moveIds,
        kept: true,
        line: movedFields(target, move.nextDueDate),
        shiftIds: moveShiftIds,
        shiftLine: shiftFields(target, move.nextDueDate),
      },
    }
  }
  throw new RangeError(`Aucune prise donnée à redater : ${doseId}`)
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
