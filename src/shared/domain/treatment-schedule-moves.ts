import { checkDay, invalid } from './treatment-schedule-checks'
import {
  dueId,
  dueOf,
  isWithinHalfStep,
  keyOf,
  latestOf,
  nextDay,
  previousDay,
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
} from './treatment-schedule-timeline'
import { sequenceDues } from './treatment-schedule-sequence'
import { build, planOf, stateWithoutDues, visiblePending } from './treatment-schedule-state'
import type {
  DoseFields,
  Due,
  LineChange,
  MoveBounds,
  MoveRefusal,
  MoveRemovalRefusal,
  MovedDose,
  PeriodTimeline,
  ShiftRemovalRefusal,
  State,
  TreatmentDoseInput,
} from './treatment-schedule-types'

// La dose déplacée : l'arrivée d'un déplacement tant qu'aucune prise n'y est notée, ou son échéance d'origine.
function movingStep(plan: PeriodTimeline, due: Due): TreatmentDoseInput | undefined {
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
export function isLocked(plan: PeriodTimeline, move: TreatmentDoseInput): boolean {
  return plan.noteDays.has(move.nextDueDate)
}

const REFUSALS: Record<MoveRefusal, string> = {
  'previous-period': 'dose d’une période précédente',
  'later-line': 'une dose plus lointaine est déjà déplacée',
  'later-dose': 'une dose plus lointaine est déjà notée',
  'no-date-left': 'plus aucune date avant la date de fin',
  'arrival-logged': 'la dose d’arrivée de son déplacement est déjà notée',
  'no-date-alone': 'seule, plus aucune date avant la dose suivante',
}

function withoutLine(state: State, doseId: string): State {
  return build({ ...state.input, doses: state.input.doses.filter(({ id }) => id !== doseId) })
}

// La première journée d'échéance sans prise après ce jour.
function nextPendingDay(plan: PeriodTimeline, day: string): string | null {
  return pendingDues(plan, { from: nextDay(day), limit: 1 })[0]?.dueOn ?? null
}

// La dose revenue à son échéance d'origine tomberait à moins d'une demi-fréquence de la suivante.
export function moveRemovalRefusal(state: State, doseId: string): MoveRemovalRefusal | null {
  const move = state.plans
    .flatMap((plan) => plan.steps.filter(isMove))
    .find(({ dose }) => dose.id === doseId)?.dose
  if (move === undefined) return null
  const plan = planOf(withoutLine(state, doseId), move.periodId)
  const back = pendingDues(plan, { from: move.dueOn, to: move.dueOn })[0]
  const nextOn = back === undefined ? null : nextPendingDay(plan, back.dueOn)
  if (back === undefined || nextOn === null) return null
  return isWithinHalfStep(back.dueOn, nextOn, plan.period.frequency)
    ? { dueOn: back.dueOn, nextOn }
    : null
}

export function removeMove(state: State, doseId: string): MovedDose {
  for (const plan of state.plans) {
    const inForce = plan.steps.filter(isMove).find(({ dose }) => dose.id === doseId)?.dose
    if (inForce !== undefined && isLocked(plan, inForce)) {
      throw new RangeError(
        `Ce déplacement ne se supprime plus : sa dose d’arrivée est déjà notée (${doseId})`,
      )
    }
    if (inForce !== undefined && moveRemovalRefusal(state, doseId) !== null) {
      throw new RangeError(`Ce report ramènerait sa dose trop près de la suivante (${doseId})`)
    }
    if (inForce !== undefined || plan.stale.some(({ id }) => id === doseId)) {
      return { report: { action: 'delete', doseId }, shift: { action: 'none' } }
    }
  }
  throw new RangeError(`Aucun déplacement à supprimer : ${doseId}`)
}

// Le décalage en vigueur d'une journée : il agit après elle entière, quelle que soit l'heure qui le porte.
function dayShiftOf(plan: PeriodTimeline, day: string): TreatmentDoseInput | undefined {
  return plan.steps.find((step) => isShift(step) && step.dose.dueOn === day)?.dose
}

function shiftLineOf(state: State, doseId: string): TreatmentDoseInput {
  const shift = state.plans
    .flatMap((plan) => plan.steps.filter(isShift))
    .find(({ dose }) => dose.id === doseId)?.dose
  if (shift === undefined) throw new RangeError(`Aucun décalage à supprimer : ${doseId}`)
  return shift
}

// N8 : la prise de la dose déplacée elle-même, à son jour d'arrivée, n'est pas une dose plus lointaine.
// Un report seul arrive avant la dose suivante (Q2 a), lue sans lui.
function passesNext(state: State, move: TreatmentDoseInput): boolean {
  const without = planOf(stateWithoutDues(state, [move]), move.periodId)
  const nextOn = nextPendingDay(without, move.dueOn)
  return nextOn !== null && move.nextDueDate >= nextOn
}

// Les reports seuls, sans décalage sur leur journée, qui passent la dose suivante.
function passingAlone(state: State, periodId: string, fromDay: string): TreatmentDoseInput[] {
  const plan = planOf(state, periodId)
  return plan.steps
    .filter(isMove)
    .map(({ dose }) => dose)
    .filter(
      (move) =>
        move.dueOn >= fromDay &&
        move.nextDueDate > move.dueOn &&
        dayShiftOf(plan, move.dueOn) === undefined &&
        passesNext(state, move),
    )
}

/**
 * Q2 a : le report seul qu'un geste ferait passer après la dose suivante, à partir de ce jour ; son
 * jour d'arrivée, `null` sans report passé.
 */
export function passedMoveOn(
  before: State,
  after: State,
  periodId: string,
  fromDay: string,
): string | null {
  return passedMove(before, after, periodId, fromDay)?.nextDueDate ?? null
}

/** Le report seul lui-même, tel qu'il est dans `after`. */
export function passedMove(
  before: State,
  after: State,
  periodId: string,
  fromDay: string,
): TreatmentDoseInput | null {
  const already = new Set(passingAlone(before, periodId, fromDay).map(({ id }) => id))
  return passingAlone(after, periodId, fromDay).find(({ id }) => !already.has(id)) ?? null
}

// N8 : la prise de la dose déplacée elle-même, à son jour d'arrivée, n'est pas une dose plus lointaine.
export function shiftRemovalRefusal(state: State, doseId: string): ShiftRemovalRefusal | null {
  const shift = shiftLineOf(state, doseId)
  const plan = planOf(state, shift.periodId)
  const report = plan.steps.filter(isMove).find(({ dose }) => dueId(dose) === dueId(shift))?.dose
  const later = notesOf(plan).filter(
    (note) => note.dueOn > shift.dueOn && note.dueOn !== report?.nextDueDate,
  )
  if (later.length > 0) return 'later-dose'
  const without = withoutLine(state, doseId)
  if (passedMoveOn(state, without, shift.periodId, shift.dueOn) !== null) return 'move-past-next'
  return strandedMove(without, shift) === undefined ? null : 'move-off-rhythm'
}

/** L'arrivée du report seul qui bloque « Supprimer ce décalage » (`move-off-rhythm`), sinon `null`. */
export function strandedMoveOn(state: State, doseId: string): string | null {
  if (shiftRemovalRefusal(state, doseId) !== 'move-off-rhythm') return null
  const shift = shiftLineOf(state, doseId)
  return strandedMove(withoutLine(state, doseId), shift)?.nextDueDate ?? null
}

// Un report seul qui suit, dont l'échéance d'origine ne serait plus une échéance du rythme rétabli.
function strandedMove(without: State, shift: TreatmentDoseInput): TreatmentDoseInput | undefined {
  const plan = planOf(without, shift.periodId)
  return plan.steps
    .filter(isMove)
    .find(
      ({ dose }) =>
        dose.dueOn > shift.dueOn && shiftOn(plan, dose) === undefined && !isOnRhythm(without, dose),
    )?.dose
}

function isOnRhythm(state: State, move: TreatmentDoseInput): boolean {
  const plan = planOf(stateWithoutDues(state, [move]), move.periodId)
  return pendingDues(plan, { from: move.dueOn, to: move.dueOn }).some(
    (due) => keyOf(due) === keyOf(move),
  )
}

export function removeShift(state: State, doseId: string): LineChange {
  const refusal = shiftRemovalRefusal(state, doseId)
  if (refusal !== null) throw new RangeError(`Ce décalage ne se supprime pas : ${refusal}`)
  return { action: 'delete', doseId }
}

// Q2 a : seule, la dose va au plus la veille de la suivante, dans le calendrier sans son report ni
// le décalage de son échéance, que le geste supprime.
function aloneBounds(state: State, due: Due, bounds: MoveBounds): MoveBounds | MoveRefusal {
  const plan = planOf(state, due.periodId)
  const existing = movingStep(plan, due)
  const moved =
    existing === undefined ? firstPendingOfDay(state, due) : originOf(state, existing, due)
  const dayShift = dayShiftOf(plan, existing?.dueOn ?? moved.dueOn)
  const without = stateWithoutDues(
    state,
    [moved, existing, dayShift].filter((line) => line !== undefined),
  )
  const nextOn = nextPendingDay(planOf(without, due.periodId), moved.dueOn)
  if (nextOn === null) return bounds
  const latest = previousDay(nextOn)
  const capped = bounds.latest !== null && bounds.latest < latest ? bounds.latest : latest
  const onlyItsDay = bounds.earliest === capped && capped === moved.dueOn
  return capped < bounds.earliest || onlyItsDay
    ? 'no-date-alone'
    : { earliest: bounds.earliest, latest: capped }
}

export function moveBounds(
  state: State,
  due: Due,
  shiftsFollowing = true,
): MoveBounds | MoveRefusal {
  const plan = planOf(state, due.periodId)
  if (plan !== state.open) return 'previous-period'
  const existing = movingStep(plan, due)
  if (existing !== undefined && isLocked(plan, existing)) return 'arrival-logged'
  const bounds =
    existing === undefined
      ? boundsOf(state, firstPendingOfDay(state, due))
      : boundsOf(stateWithoutDues(state, [existing]), originOf(state, existing, due))
  return shiftsFollowing || typeof bounds === 'string' ? bounds : aloneBounds(state, due, bounds)
}

// Une heure revenue sur la journée d'origine de la ligne : la journée repart de sa première heure sans prise.
function originOf(state: State, existing: TreatmentDoseInput, due: Due): Due {
  const onOriginDay = due.dueOn === existing.dueOn && due.dueOn !== existing.nextDueDate
  return onOriginDay
    ? firstPendingOfDay(stateWithoutDues(state, [existing]), due)
    : replacedDue(state, existing)
}

export function checkMovable(state: State, plan: PeriodTimeline, due: Due): void {
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

// Décochée, la case supprime le décalage de l'échéance déplacée : le report va seul.
function shiftChangeOf(
  shift: TreatmentDoseInput | undefined,
  origin: Due,
  to: string,
  shiftsFollowing: boolean,
): LineChange {
  if (shiftsFollowing) return shiftAlong(shift, origin, to)
  return shift === undefined ? { action: 'none' } : { action: 'delete', doseId: shift.id }
}

export function move(state: State, due: Due, to: string, shiftsFollowing = true): MovedDose {
  const plan = planOf(state, due.periodId)
  checkMovable(state, plan, due)
  checkDay(to, 'nouvelle date')
  if (to < state.input.today) throw invalid(`nouvelle date ${to} : date passée`)
  const bounds = moveBounds(state, due, shiftsFollowing)
  if (typeof bounds === 'string') {
    throw invalid(`cette dose ne se déplace pas (${bounds} : ${REFUSALS[bounds]})`)
  }
  if (to < bounds.earliest) throw invalid(`nouvelle date ${to} : pas après l’échéance précédente`)
  if (bounds.latest !== null && to > bounds.latest) {
    throw invalid(`nouvelle date ${to} : après la date de fin ou la dose suivante`)
  }
  const none = { report: { action: 'none' }, shift: { action: 'none' } } as const
  const existing = movingStep(plan, due)
  if (existing === undefined) {
    const moved = firstPendingOfDay(state, due)
    if (to === moved.dueOn) return none
    return {
      report: { action: 'create', dose: movedFields(moved, to) },
      shift: shiftChangeOf(
        shiftsFollowing ? shiftOn(plan, moved) : dayShiftOf(plan, moved.dueOn),
        moved,
        to,
        shiftsFollowing,
      ),
    }
  }
  if (to === due.dueOn) return none
  const replaced = originOf(state, existing, due)
  const shift = shiftsFollowing ? shiftOn(plan, existing) : dayShiftOf(plan, existing.dueOn)
  if (to === replaced.dueOn) {
    return {
      report: { action: 'delete', doseId: existing.id },
      shift: shift === undefined ? { action: 'none' } : { action: 'delete', doseId: shift.id },
    }
  }
  return {
    report: { action: 'rewrite', dose: movedFields(replaced, to), doseId: existing.id },
    shift: shiftChangeOf(shift, replaced, to, shiftsFollowing),
  }
}
