import { checkInput } from './treatment-schedule-checks'
import { doseFor, dueForDate, redate, upcoming } from './treatment-schedule-doses'
import { nextDay } from './treatment-schedule-dues'
import { checkMovable, isLocked, move, moveBounds, removeMove } from './treatment-schedule-moves'
import { newPeriod } from './treatment-schedule-new-period'
import { isMove, isShiftLine, mergeDoses, pendingDues } from './treatment-schedule-plan'
import { build, knownDues, planOf } from './treatment-schedule-state'
import type {
  TreatmentDoseInput,
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
  NewPeriod,
  TreatmentSchedule,
} from './treatment-schedule-types'

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
      (dose) => dose.periodId === currentPeriodId && !isShiftLine(dose),
    ),
    upcoming: (limit) => upcoming(state, limit),
    dueForDate: (givenOn, time = null) => dueForDate(state, givenOn, time),
    doseFor: (gesture) => doseFor(state, knownOnce, gesture),
    redate: (doseId, givenOn) => redate(state, doseId, givenOn),
    move: (due, to) => move(state, due, to),
    nextDoseChange:
      state.open === null
        ? null
        : [...state.open.steps.map(({ dose }) => dose), ...state.open.stale].some(
              (dose) => !isShiftLine(dose),
            )
          ? 'move'
          : 'correction',
    moveBounds: (due) => {
      checkMovable(state, planOf(state, due.periodId), due)
      const bounds = moveBounds(state, due)
      return typeof bounds === 'string' ? null : bounds
    },
    moveRefusal: (due) => {
      checkMovable(state, planOf(state, due.periodId), due)
      const bounds = moveBounds(state, due)
      return typeof bounds === 'string' ? bounds : null
    },
    lockedMoveIds: state.plans.flatMap((plan) =>
      plan.steps
        .filter(isMove)
        .filter(({ dose }) => isLocked(plan, dose))
        .map(({ dose }) => dose.id),
    ),
    removeMove: (doseId) => removeMove(state, doseId),
    newPeriod: (frequency, times) => newPeriod(state, frequency, times),
  }
}
