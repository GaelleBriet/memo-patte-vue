import { checkInput } from './treatment-schedule-checks'
import {
  doseFor,
  dueForDate,
  offersShift,
  redate,
  noteRefusal,
  redateLimits,
  redateOffersShift,
  redateRefusal,
  upcoming,
} from './treatment-schedule-doses'
import { nextDay } from './treatment-schedule-dues'
import {
  checkMovable,
  isLocked,
  move,
  moveBounds,
  moveRemovalRefusal,
  removeMove,
  removeShift,
  shiftRemovalRefusal,
  strandedMoveOn,
} from './treatment-schedule-moves'
import { newPeriod } from './treatment-schedule-new-period'
import {
  isExtraLine,
  isMove,
  isShiftLine,
  mergeDoses,
  pendingDues,
  shiftDueOf,
} from './treatment-schedule-plan'
import { firstDueOf, shiftedSequence } from './treatment-schedule-sequence'
import { build, knownDues, planOf } from './treatment-schedule-state'
import type {
  TreatmentDoseInput,
  TreatmentPeriodInput,
  TreatmentSchedule,
  TreatmentScheduleInput,
} from './treatment-schedule-types'

export { ScheduleTooLongError } from './treatment-schedule-checks'
export { familyOf, isNoteLine, type Family } from './treatment-schedule-plan'

export type {
  Frequency,
  TreatmentPeriodInput,
  DoseStatus,
  TreatmentDoseInput,
  TreatmentScheduleInput,
  Due,
  TreatmentPhase,
  DoseGesture,
  DoseFields,
  LineChange,
  NotedDose,
  RedatedDose,
  MovedDose,
  MoveBounds,
  MoveRefusal,
  MoveRemovalRefusal,
  ShiftRemovalRefusal,
  NewPeriod,
  RedateLimits,
  RedateRefusal,
  TreatmentSchedule,
} from './treatment-schedule-types'

/** « Doses suivantes décalées · prochaine le … » : la première échéance du rythme ancré. */
export function shiftedNextOn(
  shift: Pick<TreatmentDoseInput, 'dueOn' | 'nextDueDate'>,
  period: TreatmentPeriodInput,
): string {
  return firstDueOf(shiftedSequence(shift), period).dueOn
}

/** « Avancée au … » plutôt que « Reportée au … » : la nouvelle date précède l'échéance remplacée. */
export function isAdvanced(
  dose: Pick<TreatmentDoseInput, 'status' | 'dueOn' | 'nextDueDate'>,
): boolean {
  return dose.status === 'postponed' && dose.nextDueDate < dose.dueOn
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
    currentPeriodHasDose: doses.some(
      (dose) => dose.periodId === currentPeriodId && !isShiftLine(dose) && !isExtraLine(dose),
    ),
    upcoming: (limit) => upcoming(state, limit),
    dueForDate: (givenOn, time = null) => dueForDate(state, givenOn, time),
    doseFor: (gesture) => doseFor(state, knownOnce, gesture),
    redate: (doseId, givenOn, shiftsFollowing = true) => {
      const { dose, shift, postponement } = redate(state, doseId, givenOn, shiftsFollowing)
      return { dose, shift, postponement }
    },
    redateOffersShift: (doseId, givenOn) => redateOffersShift(state, doseId, givenOn),
    redateRefusal: (doseId, givenOn, shiftsFollowing = true) =>
      redateRefusal(state, doseId, givenOn, shiftsFollowing),
    noteRefusal: (due, givenOn) => noteRefusal(state, knownOnce, due, givenOn),
    offersShift: (due, givenOn) => offersShift(state, knownOnce, due, givenOn),
    redateLimits: (doseId) => redateLimits(state, doseId),
    move: (due, to, shiftsFollowing = true) => move(state, due, to, shiftsFollowing),
    nextDoseChange:
      state.open === null
        ? null
        : [...state.open.steps.map(({ dose }) => dose), ...state.open.stale].some(
              (dose) => !isShiftLine(dose),
            )
          ? 'move'
          : 'correction',
    moveBounds: (due, shiftsFollowing = true) => {
      checkMovable(state, planOf(state, due.periodId), due)
      const bounds = moveBounds(state, due, shiftsFollowing)
      return typeof bounds === 'string' ? null : bounds
    },
    moveRefusal: (due, shiftsFollowing = true) => {
      checkMovable(state, planOf(state, due.periodId), due)
      const bounds = moveBounds(state, due, shiftsFollowing)
      return typeof bounds === 'string' ? bounds : null
    },
    lockedMoveIds: state.plans.flatMap((plan) =>
      plan.steps
        .filter(isMove)
        .filter(({ dose }) => isLocked(plan, dose))
        .map(({ dose }) => dose.id),
    ),
    removeMove: (doseId) => removeMove(state, doseId),
    moveRemovalRefusal: (doseId) => moveRemovalRefusal(state, doseId),
    removeShift: (doseId) => removeShift(state, doseId),
    shiftRemovalRefusal: (doseId) => shiftRemovalRefusal(state, doseId),
    strandedMoveOn: (doseId) => strandedMoveOn(state, doseId),
    shiftDueOf: (due) => shiftDueOf(planOf(state, due.periodId), due),
    newPeriod: (frequency, times) => newPeriod(state, frequency, times),
  }
}
