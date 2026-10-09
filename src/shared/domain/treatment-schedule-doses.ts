import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { isClockTime } from './clock-time'
import { MAX_DUES, checkPastDay, invalid } from './treatment-schedule-checks'
import { compareOrdinal, nextDay, previousDay, toDate } from './calendar-day'
import { DAYS_PER_STEP, shiftDate } from './treatment-frequency'
import { hasSeveralDoseTimes } from './treatment-periods'
import {
  dueId,
  dueOf,
  isWithinHalfStep,
  keyOf,
  sameDue,
  uniqueSorted,
} from './treatment-schedule-dues'
import {
  isLocked,
  movedFields,
  passedMove,
  passedMoveOn,
  shiftFields,
} from './treatment-schedule-moves'
import {
  compareCreation,
  familyOf,
  hasFallen,
  mergeDoses,
  notesOf,
  pendingDues,
  positionOf,
  sequenceAt,
  shiftDueOf,
  shiftOn,
} from './treatment-schedule-timeline'
import { firstDueOf, shiftedSequence } from './treatment-schedule-sequence'
import {
  build,
  knownDues,
  nearUpcoming,
  nextInSequence,
  planOf,
  stateWithout,
  stateWithoutDues,
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
  PeriodTimeline,
  RedateLimits,
  RedateRefusal,
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
  plan: PeriodTimeline,
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

// Q2 c : la dose d'un report sans décalage, donnée un autre jour, ne décale pas les suivantes.
function isMovedAlone(plan: PeriodTimeline, due: Due): boolean {
  return plan.steps.some(
    ({ kind, dose }) =>
      kind === 'move' && dose.nextDueDate === due.dueOn && shiftOn(plan, dose) === undefined,
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
    !hitsAMove(plan, due, givenOn) &&
    !isMovedAlone(plan, due)
  )
}

// Q2 a : le rythme ancré à la date réelle ferait passer la dose suivante à ce report seul (son arrivée).
function passedByShift(others: State, due: Due, givenOn: string): string | null {
  const plan = planOf(others, due.periodId)
  const origin = shiftDueOf(plan, due)
  const prise: DoseFields = { ...dueOf(due), givenOn, status: 'given', nextDueDate: givenOn }
  const after = stateAfter(others, [
    { id: shiftOn(plan, origin)?.id ?? null, fields: shiftFields(origin, givenOn) },
    { id: null, fields: prise },
  ])
  return passedMoveOn(others, after, due.periodId, due.dueOn)
}

/** La case de « Fait à une autre date » cochée ferait passer ce report seul (son arrivée), refusée. */
export function noteRefusal(
  state: State,
  known: () => Set<string>,
  due: Due,
  givenOn: string,
): string | null {
  checkKnown(known, due)
  checkPastDay(givenOn, state.input.today, 'date réelle')
  const others = stateWithoutNote(state, due)
  if (isExtra(others, due, givenOn)) return null
  if (!restartsFrom(others, due, givenOn, nextInSequence(others, due))) return null
  return passedByShift(others, due, givenOn)
}

// La première dose du rythme ancré à la date réelle, après la journée qui porte le décalage.
function restartedOn(plan: PeriodTimeline, due: Due, givenOn: string): string {
  const floor = `${shiftDueOf(plan, due).dueOn} ~`
  return firstDueOf({ origin: givenOn, firstStep: 1, floor }, plan.period).dueOn
}

type Written = { id: string | null; fields: DoseFields | null }

// Le carnet une fois ces lignes écrites (`fields` nul : supprimée).
function stateAfter(state: State, written: Written[]): State {
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
  return build({ ...state.input, doses })
}

// Comme le repository (TR-25) : une ligne réécrite ou supprimée emporte ses sœurs, même échéance et même famille.
function withSisters(state: State, written: Written[]): Written[] {
  const touched = new Set(written.map(({ id }) => id))
  const sisters = written.flatMap(({ id }) => {
    const line = state.input.doses.find((dose) => dose.id === id)
    if (line === undefined) return []
    return state.input.doses
      .filter(
        (other) =>
          !touched.has(other.id) &&
          dueId(other) === dueId(line) &&
          familyOf(other) === familyOf(line),
      )
      .map((other): Written => ({ id: other.id, fields: null }))
  })
  return [...written, ...sisters]
}

// La prochaine échéance que le calendrier montrera une fois ces lignes écrites.
function nextAfter(state: State, due: Due, written: Written[]): string {
  return nextInSequence(stateAfter(state, written), due)
}

function checkKnown(known: () => Set<string>, due: Due): void {
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

// Une prise un intervalle ou plus avant sa dose est une prise en plus ; à plusieurs heures, l'heure
// donnée en avance couvre son échéance (G10).
function isExtra(state: State, due: Due, givenOn: string): boolean {
  const { frequency, times } = planOf(state, due.periodId).period
  return !hasSeveralDoseTimes(times) && shiftDate(givenOn, frequency, 1) <= due.dueOn
}

// Sa prochaine dose est la première échéance sans prise après elle : le calendrier ne bouge pas.
function extraFields(state: State, at: Due, otherwise: string): DoseFields {
  const next = pendingDues(planOf(state, at.periodId), { from: at.dueOn, limit: 2 }).find(
    (pending) => keyOf(pending) > keyOf(at),
  )
  return { ...dueOf(at), givenOn: at.dueOn, status: 'extra', nextDueDate: next?.dueOn ?? otherwise }
}

function extraFor(state: State, due: Due, givenOn: string): NotedDose {
  const at = { periodId: due.periodId, dueOn: givenOn, dueTime: due.dueTime }
  return { dose: extraFields(state, at, due.dueOn), shift: null }
}

// Le dernier jour d'où une prise de cette échéance serait un intervalle ou plus en avance.
function lastExtraDayOf(state: State, line: TreatmentDoseInput): string | null {
  const { frequency, times } = planOf(state, line.periodId).period
  if (hasSeveralDoseTimes(times)) return null
  let day = shiftDate(line.dueOn, frequency, -1)
  while (shiftDate(nextDay(day), frequency, 1) <= line.dueOn) day = nextDay(day)
  return day
}

function extraOf(state: State, doseId: string): TreatmentDoseInput | undefined {
  return mergeDoses(state.input.doses).find(({ id, status }) => id === doseId && status === 'extra')
}

export function redateLimits(state: State, doseId: string): RedateLimits {
  const extra = extraOf(state, doseId)
  if (extra !== undefined) {
    const takenDays = mergeDoses(state.input.doses)
      .filter((dose) => dose.status === 'extra' && dose.periodId === extra.periodId)
      .map(({ dueOn }) => dueOn)
      .filter((day) => day !== extra.dueOn)
    return { lastExtraDay: null, takenDays }
  }
  const given = state.plans
    .flatMap(notesOf)
    .find(({ id, status }) => id === doseId && status === 'given')
  return { lastExtraDay: given === undefined ? null : lastExtraDayOf(state, given), takenDays: [] }
}

// Q4, sans case : le décalage qui ferait sortir des doses de la date de fin ne s'écrit pas quand la
// dose suivante tombe au moins une demi-fréquence après la prise ; écrit, il dit les journées perdues.
function endCut(
  others: State,
  due: Due,
  givenOn: string,
  written: Written[],
): { kept: boolean; days: string[] } {
  const { endsOn, frequency } = planOf(others, due.periodId).period
  if (endsOn === null) return { kept: false, days: [] }
  const daysLeft = (state: State) => [
    ...new Set(
      pendingDues(planOf(state, due.periodId), { from: nextDay(due.dueOn) }).map(
        ({ dueOn }) => dueOn,
      ),
    ),
  ]
  const kept = daysLeft(stateAfter(others, written.slice(0, 1)))
  const shifted = daysLeft(stateAfter(others, written))
  if (shifted.length >= kept.length) return { kept: false, days: [] }
  return { kept: !isWithinHalfStep(givenOn, kept[0]!, frequency), days: kept.slice(shifted.length) }
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
      const plan = planOf(others, due.periodId)
      const wanted = gesture.shiftsFollowing !== false && restartsFrom(others, due, givenOn, next)
      const passed = wanted ? passedByShift(others, due, givenOn) : null
      // Case cochée : refusé ; « C'est fait » sans case : la prise seule, le décalage n'est pas demandé.
      if (passed !== null && gesture.shiftsFollowing === true) {
        throw new RangeError(
          `Le décalage ferait passer le report du ${passed} après la dose suivante`,
        )
      }
      const restarts = wanted && passed === null
      const shift = restarts ? shiftFields(shiftDueOf(plan, due), givenOn) : null
      const dose: DoseFields = { ...dueOf(due), givenOn, status: 'given', nextDueDate: next }
      if (shift === null) return passed === null ? { dose, shift } : { dose, shift, heldBy: passed }
      const written = [
        { id: null, fields: dose },
        { id: shiftOn(plan, shift)?.id ?? null, fields: shift },
      ]
      const cut =
        gesture.shiftsFollowing === undefined
          ? endCut(others, due, givenOn, written)
          : { kept: false, days: [] }
      if (cut.kept) return { dose, shift: null, keptToEnd: cut.days }
      const shifted = { dose: { ...dose, nextDueDate: nextAfter(others, due, written) }, shift }
      return cut.days.length === 0 ? shifted : { ...shifted, lostToEnd: cut.days }
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
  plan: PeriodTimeline,
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
  plan: PeriodTimeline,
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
  const firstTime = [...plan.period.times].sort(compareOrdinal)[0] ?? null
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

// Une prise en plus redatée est notée de nouveau à cette date : elle vise ce que viserait une prise
// notée ce jour-là, et peut redevenir la prise de la dose prévue ; sans dose à viser, elle reste en plus.
function redateExtra(state: State, extra: TreatmentDoseInput, givenOn: string): RedatedDose {
  const none = { action: 'none' } as const
  if (givenOn === extra.givenOn) return { dose: fieldsOf(extra), shift: none, postponement: null }
  if (redateLimits(state, extra.id).takenDays.includes(givenOn)) {
    throw new RangeError(`Le ${givenOn} a déjà une prise en plus`)
  }
  const due = dueForDate(state, givenOn, null)
  if (due === null || isExtra(state, due, givenOn)) {
    const at = { periodId: extra.periodId, dueOn: givenOn, dueTime: extra.dueTime }
    return { dose: extraFields(state, at, extra.nextDueDate), shift: none, postponement: null }
  }
  const noted = doseFor(state, () => knownDues(state), { kind: 'given', due, givenOn })
  const shift =
    noted.shift === null
      ? none
      : shiftChange(shiftOn(planOf(state, due.periodId), noted.shift), noted.shift)
  return { dose: noted.dose, shift, postponement: null }
}

function laterDay(a: string, b: string): string {
  return a > b ? a : b
}

/**
 * I2 : le report seul qu'une correction ferait passer suit. Il vise l'échéance du nouveau calendrier
 * la plus proche de son ancienne arrivée et garde cette date quand elle reste dans les bornes de
 * Q2 a ; sinon elle s'en approche, jamais avant aujourd'hui. `null` : aucune date ne convient.
 */
function followingReport(
  state: State,
  dose: TreatmentDoseInput,
  after: State,
  moved: TreatmentDoseInput,
  postponement: RedatedDose['postponement'],
): RedatedDose['postponement'] {
  const original = state.input.doses.find(({ id }) => id === moved.id)
  if (original === undefined) return null
  if (postponement !== null && !postponement.doseIds.includes(moved.id)) return null
  const plan = planOf(stateWithoutDues(after, [moved]), dose.periodId)
  const was = original.nextDueDate
  const horizon = shiftDate(was, plan.period.frequency, 2)
  const days = [
    ...new Set(
      pendingDues(plan, { from: nextDay(dose.dueOn), to: horizon }).map(({ dueOn }) => dueOn),
    ),
  ].sort(compareOrdinal)
  const distance = (day: string) => Math.abs(differenceInCalendarDays(toDate(day), toDate(was)))
  const targetDay = days.reduce<string | undefined>(
    (best, day) => (best === undefined || distance(day) < distance(best) ? day : best),
    undefined,
  )
  if (targetDay === undefined) return null
  const index = days.indexOf(targetDay)
  const previous = days[index - 1] ?? dose.dueOn
  const earliest = laterDay(state.input.today, nextDay(previous))
  const nextOn = days[index + 1]
  const latest = nextOn === undefined ? null : previousDay(nextOn)
  if (latest !== null && earliest > latest) return null
  const arrival = was < earliest ? earliest : latest !== null && was > latest ? latest : was
  if (arrival === targetDay) return { doseIds: [moved.id], kept: false, followedOn: arrival }
  const target = pendingDues(plan, { from: targetDay, to: targetDay })[0]
  if (target === undefined) return null
  return {
    doseIds: [moved.id],
    kept: true,
    line: movedFields(target, arrival),
    shiftIds: [],
    shiftLine: shiftFields(target, arrival),
    followed: true,
  }
}

/** Cochée, la case écrirait un décalage, ou serait refusée (Q2 a) ; date de fin comprise (Q4). */
export function offersShift(
  state: State,
  known: () => Set<string>,
  due: Due,
  givenOn: string,
): boolean {
  checkKnown(known, due)
  checkPastDay(givenOn, state.input.today, 'date réelle')
  const others = stateWithoutNote(state, due)
  return (
    !isExtra(others, due, givenOn) &&
    restartsFrom(others, due, givenOn, nextInSequence(others, due))
  )
}

/** Ce jour ferait passer la dose suivante à un report seul (Q2 a) : son jour d'arrivée. */
export class RedateRefusedError extends RangeError {
  constructor(
    readonly passedOn: string,
    readonly offersShift: boolean,
    readonly reason: RedateRefusal['reason'] = 'passes',
  ) {
    super(`La prise corrigée ferait passer le report du ${passedOn} après la dose suivante`)
  }
}

export function redateRefusal(
  state: State,
  doseId: string,
  givenOn: string,
  shiftsFollowing = true,
): RedateRefusal | null {
  try {
    redate(state, doseId, givenOn, shiftsFollowing)
    return null
  } catch (cause) {
    if (cause instanceof RedateRefusedError) return { on: cause.passedOn, reason: cause.reason }
    throw cause
  }
}

export function redateOffersShift(state: State, doseId: string, givenOn: string): boolean {
  if (extraOf(state, doseId) !== undefined) return false
  try {
    return redate(state, doseId, givenOn).offersShift
  } catch (cause) {
    if (cause instanceof RedateRefusedError) return cause.offersShift
    throw cause
  }
}

// N2 : une prise qui a décalé la suite la décale encore, depuis sa nouvelle date ; une autre se
// recalcule comme notée ce jour-là, sur le carnet d'aujourd'hui (une dose non renseignée ne décale rien).
// Case décochée, son décalage est supprimé, ou rendu à son report pour une dose avancée (G18).
export function redate(
  state: State,
  doseId: string,
  givenOn: string,
  shiftsFollowing = true,
): RedatedDose & { offersShift: boolean } {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  const extra = extraOf(state, doseId)
  if (extra !== undefined) return { ...redateExtra(state, extra, givenOn), offersShift: false }
  for (const plan of state.plans) {
    const dose = notesOf(plan).find((note) => note.id === doseId)
    if (dose?.status !== 'given') continue
    if (givenOn === dose.givenOn) {
      const offersShift = shiftOn(plan, shiftDueOf(plan, dose)) !== undefined
      return { dose: fieldsOf(dose), shift: { action: 'none' }, postponement: null, offersShift }
    }
    const lastExtraDay = lastExtraDayOf(state, dose)
    if (lastExtraDay !== null && givenOn <= lastExtraDay) {
      throw new RangeError(`Le ${givenOn} ferait de la prise ${doseId} une prise en plus`)
    }
    const origin = shiftDueOf(plan, dose)
    const shift = shiftOn(plan, origin)
    // Une dose avancée sans décalage à elle garde celui de son report, ancré à son jour d'arrivée.
    const reportShift = sameDue(origin, dose) ? null : shiftFields(origin, dose.dueOn)
    const ownShift = shift?.nextDueDate === reportShift?.nextDueDate ? undefined : shift
    const others = stateWithout(state, dose)
    const next = nextInSequence(others, dose)
    const followingOfShift = shift === undefined ? null : followingMove(plan, dose, shift)
    // Le décalage reste tel quel quand le rythme de la nouvelle date retomberait sur un report.
    const hitsReport =
      ownShift !== undefined &&
      givenOn !== dose.dueOn &&
      hitsAMove(planOf(others, dose.periodId), dose, givenOn, followingOfShift)
    const offersShift =
      ownShift === undefined ? restartsFrom(others, dose, givenOn, next) : givenOn !== dose.dueOn
    const fields: DoseFields = { ...dueOf(dose), givenOn, status: 'given', nextDueDate: next }
    const linesFor = (flag: boolean) => {
      const shifts = flag && offersShift && !hitsReport
      const restartsOn = shifts ? restartedOn(plan, dose, givenOn) : next
      const wanted = shifts
        ? shiftFields(origin, givenOn)
        : shift === undefined
          ? null
          : reportShift
      const shiftLine =
        (flag && hitsReport) || shift?.nextDueDate === wanted?.nextDueDate
          ? ({ action: 'none' } as const)
          : shiftChange(shift, wanted)
      const writtenWith = (kept: RedatedDose['postponement']): Written[] => [
        { id: dose.id, fields },
        ...lineWritten(shiftLine),
        ...(kept === null
          ? []
          : kept.kept
            ? [
                ...kept.doseIds.map((id) => ({ id, fields: kept.line })),
                ...kept.shiftIds.map((id) => ({ id, fields: kept.shiftLine })),
              ]
            : kept.doseIds.map((id) => ({ id, fields: null }))),
      ]
      const kept = postponementAfter(plan, dose, ownShift, shifts, givenOn, restartsOn)
      // Un report seul suit vers l'échéance la plus proche de son arrivée (I2), pas vers celle que fixe la prise.
      const lone = kept?.kept === true && kept.shiftIds.length === 0 && shifts
      const original = lone ? state.input.doses.find(({ id }) => id === kept.doseIds[0]) : undefined
      const base = stateAfter(state, withSisters(state, writtenWith(null)))
      const follows =
        original === undefined ? null : followingReport(state, dose, base, original, kept)
      const same =
        follows?.kept === true &&
        kept?.kept === true &&
        keyOf(follows.line) === keyOf(kept.line) &&
        follows.line.nextDueDate === kept.line.nextDueDate
      const postponement = follows === null || same ? kept : follows
      const after = stateAfter(state, withSisters(state, writtenWith(postponement)))
      const passed = passedMove(state, after, dose.periodId, dose.dueOn)
      return { shiftLine, postponement, writtenWith, after, passed }
    }
    const chosen = linesFor(shiftsFollowing)
    let { postponement } = chosen
    if (chosen.passed !== null) {
      // I2 : refusée dans les deux états de la case, la correction fait suivre le report.
      const otherState = linesFor(!shiftsFollowing).passed === null
      const followed = otherState
        ? null
        : followingReport(state, dose, chosen.after, chosen.passed, chosen.postponement)
      const passes =
        followed === null ||
        passedMove(
          state,
          stateAfter(state, withSisters(state, chosen.writtenWith(followed))),
          dose.periodId,
          dose.dueOn,
        ) !== null
      if (passes) {
        const was = state.input.doses.find(({ id }) => id === chosen.passed?.id)
        throw new RedateRefusedError(
          was?.nextDueDate ?? chosen.passed.nextDueDate,
          offersShift,
          otherState ? 'passes' : 'stuck',
        )
      }
      postponement = followed
    }
    const nextDueDate = nextAfter(state, dose, chosen.writtenWith(postponement))
    return { dose: { ...fields, nextDueDate }, shift: chosen.shiftLine, postponement, offersShift }
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
    .sort((a, b) => compareOrdinal(keyOf(a.due), keyOf(b.due)))
  const last = entries.filter(({ due }) => due.dueOn <= date).at(-1)
  if (last !== undefined && (last.status === null || last.status === 'missed')) return last.due
  const ahead = entries.find(({ due, status }) => status === null && due.dueOn > date)
  if (ahead !== undefined) return ahead.due
  return nearUpcoming(state).find(matches) ?? null
}
