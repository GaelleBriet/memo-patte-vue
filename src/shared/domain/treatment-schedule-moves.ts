import { checkDay, invalid } from './treatment-schedule-checks'
import {
  dueOf,
  keyOf,
  latestOf,
  nextDay,
  sameDue,
  shiftDate,
  uniqueSorted,
} from './treatment-schedule-dues'
import {
  isMove,
  isNoteLine,
  isShift,
  notesOf,
  pendingDues,
  positionOf,
  sequenceAt,
  shiftOn,
} from './treatment-schedule-plan'
import { sequenceDues } from './treatment-schedule-sequence'
import { planOf, stateWithoutDues, visiblePending } from './treatment-schedule-state'
import type {
  DoseFields,
  Due,
  LineChange,
  MoveBounds,
  MoveRefusal,
  MovedDose,
  PeriodPlan,
  State,
  TreatmentDoseInput,
} from './treatment-schedule-types'

// La dose déplacée : l'arrivée d'un déplacement tant qu'aucune prise n'y est notée, ou son échéance d'origine.
function movingStep(plan: PeriodPlan, due: Due): TreatmentDoseInput | undefined {
  return plan.steps
    .filter(isMove)
    .map(({ dose }) => dose)
    .filter(
      (move) =>
        (move.nextDueDate === due.dueOn && !plan.noteDays.has(due.dueOn)) ||
        move.dueOn === due.dueOn,
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
  const { frequency } = plan.period
  // En mois, le 31 mars plus un mois retombe aussi sur le 30 avril : on avance jusqu'à ne plus y retomber.
  let oneStepBefore = shiftDate(moved.dueOn, frequency, -1)
  while (shiftDate(nextDay(oneStepBefore), frequency, 1) <= moved.dueOn) {
    oneStepBefore = nextDay(oneStepBefore)
  }
  return (
    latestOf([
      ...plan.steps.filter((step) => !isShift(step)).map(({ dose }) => dose.dueOn),
      ...notesOf(plan).map((dose) => dose.givenOn),
      ...dueDaysOf(pending),
      ...earlier,
      oneStepBefore,
    ]) ?? oneStepBefore
  )
}

// Le moteur ne tient pas une dose déplacée quand une ligne existe déjà plus loin, même sans effet ;
// un décalage plus loin garde la main après son jour d'origine.
function boundsOf(state: State, moved: Due): MoveBounds | MoveRefusal {
  const { today } = state.input
  const plan = planOf(state, moved.periodId)
  const lines = [...plan.steps.map(({ dose }) => dose), ...plan.stale]
  const later = lines.filter((dose) => dose.dueOn > moved.dueOn)
  if (later.some(isNoteLine)) return 'later-dose'
  if (later.length > 0) return 'later-line'
  const afterPrevious = nextDay(dayBeforeMove(state, moved))
  const earliest = latestOf([today, plan.period.startsOn, afterPrevious]) ?? today
  const latest = plan.period.endsOn
  return latest !== null && earliest > latest ? 'no-date-left' : { earliest, latest }
}

// Q21 : « Prochaine dose » déplace la journée, à partir de sa première heure encore sans prise.
function firstPendingOfDay(state: State, due: Due): Due {
  const sameDay = visiblePending(state).filter(
    (other) => other.periodId === due.periodId && other.dueOn === due.dueOn,
  )
  return uniqueSorted([due, ...sameDay])[0] ?? due
}

// Q25 : sa dose d'arrivée notée, un déplacement fait partie de l'historique.
export function isLocked(plan: PeriodPlan, move: TreatmentDoseInput): boolean {
  return plan.noteDays.has(move.nextDueDate)
}

const REFUSALS: Record<MoveRefusal, string> = {
  'previous-period': 'dose d’une période précédente',
  'later-line': 'une dose plus lointaine est déjà déplacée',
  'later-dose': 'une dose plus lointaine est déjà notée',
  'no-date-left': 'plus aucune date avant la date de fin',
  'arrival-logged': 'la dose d’arrivée de son déplacement est déjà notée',
}

export function removeMove(state: State, doseId: string): MovedDose {
  for (const plan of state.plans) {
    const inForce = plan.steps.filter(isMove).find(({ dose }) => dose.id === doseId)?.dose
    if (inForce !== undefined && isLocked(plan, inForce)) {
      throw new RangeError(
        `Ce déplacement ne se supprime plus : sa dose d’arrivée est déjà notée (${doseId})`,
      )
    }
    if (inForce !== undefined || plan.stale.some(({ id }) => id === doseId)) {
      return { report: { action: 'delete', doseId }, shift: { action: 'none' } }
    }
  }
  throw new RangeError(`Aucun déplacement à supprimer : ${doseId}`)
}

export function moveBounds(state: State, due: Due): MoveBounds | MoveRefusal {
  const plan = planOf(state, due.periodId)
  if (plan !== state.open) return 'previous-period'
  const existing = movingStep(plan, due)
  if (existing !== undefined && isLocked(plan, existing)) return 'arrival-logged'
  return existing === undefined
    ? boundsOf(state, firstPendingOfDay(state, due))
    : boundsOf(stateWithoutDues(state, [existing]), originOf(state, existing, due))
}

// Une heure revenue sur la journée d'origine de la ligne : la journée repart de sa première heure sans prise.
function originOf(state: State, existing: TreatmentDoseInput, due: Due): Due {
  const onOriginDay = due.dueOn === existing.dueOn && due.dueOn !== existing.nextDueDate
  return onOriginDay
    ? firstPendingOfDay(stateWithoutDues(state, [existing]), due)
    : replacedDue(state, existing)
}

export function checkMovable(state: State, plan: PeriodPlan, due: Due): void {
  if (plan.noteKeys.has(keyOf(due))) {
    throw new RangeError(`Échéance déjà notée : ${JSON.stringify(due)}`)
  }
  const isPending = visiblePending(state).some((other) => sameDue(other, due))
  if (!isPending && movingStep(plan, due) === undefined) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

// Sans sa ligne, la dose déplacée est la première échéance sans prise à partir de son échéance d'origine.
function replacedDue(state: State, move: TreatmentDoseInput): Due {
  const plan = planOf(stateWithoutDues(state, [move]), move.periodId)
  const pending = pendingDues(plan, { from: move.dueOn, limit: plan.period.times.length + 1 })
  const first = pending.find((due) => keyOf(due) >= keyOf(move))
  if (first !== undefined) return first
  // Après la date de fin : la prochaine échéance de la suite, même si elle n'entre plus dans la période.
  for (const due of sequenceDues(
    sequenceAt(plan, positionOf(keyOf(move), 0)),
    plan.period,
    move.dueOn,
  )) {
    if (keyOf(due) >= keyOf(move) && !plan.noteKeys.has(keyOf(due))) return due
  }
  return dueOf(move)
}

export function movedFields(due: Due, to: string): DoseFields {
  return { ...dueOf(due), givenOn: null, status: 'postponed', nextDueDate: to }
}

export function shiftFields(due: Due, anchoredOn: string): DoseFields {
  return { ...dueOf(due), givenOn: null, status: 'shift', nextDueDate: anchoredOn }
}

// Le report et son décalage ont la même échéance d'origine et la même date (§2.6, règle 4).
function shiftAlong(shift: TreatmentDoseInput | undefined, origin: Due, to: string): LineChange {
  const dose = shiftFields(origin, to)
  return shift === undefined
    ? { action: 'create', dose }
    : { action: 'rewrite', dose, doseId: shift.id }
}

export function move(state: State, due: Due, to: string): MovedDose {
  const plan = planOf(state, due.periodId)
  checkMovable(state, plan, due)
  checkDay(to, 'nouvelle date')
  if (to < state.input.today) throw invalid(`nouvelle date ${to} : date passée`)
  const bounds = moveBounds(state, due)
  if (typeof bounds === 'string') {
    throw invalid(`cette dose ne se déplace pas (${bounds} : ${REFUSALS[bounds]})`)
  }
  if (to < bounds.earliest) throw invalid(`nouvelle date ${to} : pas après l’échéance précédente`)
  if (bounds.latest !== null && to > bounds.latest) {
    throw invalid(`nouvelle date ${to} : après la date de fin`)
  }
  const none = { report: { action: 'none' }, shift: { action: 'none' } } as const
  const existing = movingStep(plan, due)
  if (existing === undefined) {
    const moved = firstPendingOfDay(state, due)
    if (to === moved.dueOn) return none
    return {
      report: { action: 'create', dose: movedFields(moved, to) },
      shift: shiftAlong(shiftOn(plan, moved), moved, to),
    }
  }
  if (to === due.dueOn) return none
  const replaced = originOf(state, existing, due)
  const shift = shiftOn(plan, existing)
  if (to === replaced.dueOn) {
    return {
      report: { action: 'delete', doseId: existing.id },
      shift: shift === undefined ? { action: 'none' } : { action: 'delete', doseId: shift.id },
    }
  }
  return {
    report: { action: 'rewrite', dose: movedFields(replaced, to), doseId: existing.id },
    shift: shiftAlong(shift, replaced, to),
  }
}
