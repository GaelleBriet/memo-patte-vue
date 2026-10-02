import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import type { z } from 'zod'

import { currentPeriodOf, treatmentScheduleOf } from './treatment-schedule'
import type {
  NewTreatmentPlan,
  PlannedDoseWrite,
  TreatmentPlanWrite,
  TreatmentWithHistory,
} from '../repository/treatments.repository'
import {
  treatmentCreationSchema,
  treatmentEditionSchema,
  treatmentResumptionSchema,
  type TreatmentCreationInput,
  type TreatmentEditionInput,
  type TreatmentResumptionInput,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import {
  isAdvanced,
  type Due,
  type MoveRefusal,
  type MovedDose,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'
import { orderPeriods } from '@/shared/domain/treatment-schedule-plan'

type Edition = z.output<typeof treatmentEditionSchema>

/** Ce que le champ « Prochaine dose » dit sous sa date. */
export type NextDoseHelp =
  | { kind: 'refused'; refusal: MoveRefusal }
  /** Échéances passées que la nouvelle première échéance fait disparaître. */
  | { kind: 'dropped'; count: number }
  | { kind: 'overdue'; since: string }
  | { kind: 'calculated'; on: string }
  /** La date calculée est passée : aujourd'hui est proposé à sa place. */
  | { kind: 'calculated-passed'; on: string }

export type NextDoseDraft = {
  /** `first-due` : la date choisie devient la première échéance de la période ; `move` : une ligne « Reportée / Avancée ». */
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** La date de fin saisie, `null` sans date de fin. */
  latest: string | null
  refusal: MoveRefusal | null
  help: NextDoseHelp | null
  /** La dose est déjà déplacée, et son arrivée dépasse la date de fin saisie. */
  moveAfterEnd: 'postponed' | 'advanced' | null
}

export type EditionDraft = {
  period: TreatmentPeriodRecord
  /** `locked` : traitement arrêté ou fini, seuls le nom et le type se corrigent ; `open` : nouvelle période (TR-28). */
  change: 'locked' | 'correct' | 'open'
  /** `null` : aucune dose à venir. */
  nextDose: NextDoseDraft | null
}

export type PlanIds = { periodId: string; doseId: string }

type Resolved = EditionDraft & {
  settings: TreatmentPeriodSettings
  move: MovedDose | null
  /** La première échéance vient de `newPeriod` : la date de fin doit la suivre. */
  proposesFirstDue: boolean
}

function sortedTimes(times: readonly string[]): string[] {
  return [...times].sort()
}

function rhythmOf(period: TreatmentPeriodRecord): TreatmentRhythm {
  return {
    frequency: period.frequency,
    times: period.times,
    doseQuantity: period.doseQuantity,
    doseUnit: period.doseUnit,
    endsOn: period.endsOn,
  }
}

function settingsOf(period: TreatmentPeriodRecord): TreatmentPeriodSettings {
  return {
    startsOn: period.startsOn,
    firstDueOn: period.firstDueOn,
    reminderOffsetMinutes: period.reminderOffsetMinutes,
    reminderTime: period.reminderTime,
    ...rhythmOf(period),
  }
}

function withRhythm(
  settings: TreatmentPeriodSettings,
  rhythm: TreatmentRhythm,
): TreatmentPeriodSettings {
  return {
    ...settings,
    frequency: rhythm.frequency,
    times: sortedTimes(rhythm.times),
    doseQuantity: rhythm.doseQuantity,
    doseUnit: rhythm.doseUnit,
    endsOn: rhythm.endsOn,
  }
}

function sameSettings(a: TreatmentPeriodSettings, b: TreatmentPeriodSettings): boolean {
  return (
    JSON.stringify({ ...a, times: sortedTimes(a.times) }) ===
    JSON.stringify({ ...b, times: sortedTimes(b.times) })
  )
}

function changesRhythm(period: TreatmentPeriodRecord, rhythm: TreatmentRhythm): boolean {
  const before = settingsOf(period)
  return !sameSettings(before, { ...withRhythm(before, rhythm), endsOn: period.endsOn })
}

function latestOf(days: (string | null | undefined)[]): string | null {
  return days.reduce<string | null>(
    (latest, day) => (day && (latest === null || day > latest) ? day : latest),
    null,
  )
}

function hasNote(schedule: TreatmentSchedule, periodId?: string): boolean {
  return schedule.doses.some(
    (dose) => dose.status !== 'postponed' && (periodId === undefined || dose.periodId === periodId),
  )
}

function withoutStale(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
): TreatmentWithHistory {
  const stale = new Set(schedule.staleDoseIds)
  return { ...history, doses: history.doses.filter(({ id }) => !stale.has(id)) }
}

function withPeriodSettings(
  history: TreatmentWithHistory,
  periodId: string,
  settings: TreatmentPeriodSettings,
): TreatmentWithHistory {
  return {
    ...history,
    periods: history.periods.map((other) =>
      other.id === periodId ? { ...other, ...settings } : other,
    ),
  }
}

function currentPeriod(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
): TreatmentPeriodRecord {
  const period = currentPeriodOf(history, schedule)
  if (period === null) throw new Error(`Traitement sans période : ${history.id}`)
  return period
}

function moveArrivingOn(schedule: TreatmentSchedule, due: Due) {
  return schedule.doses.find(
    (dose) =>
      dose.status === 'postponed' &&
      dose.periodId === due.periodId &&
      dose.nextDueDate === due.dueOn,
  )
}

function lastNotedDueOn(history: TreatmentWithHistory, periodId?: string): string | null {
  return latestOf(
    history.doses
      .filter(
        (dose) =>
          dose.status !== 'postponed' && (periodId === undefined || dose.periodId === periodId),
      )
      .map((dose) => dose.dueOn),
  )
}

// La date calculée, sans le plancher d'aujourd'hui : le moteur la rend quand il se place au jour de la dernière prise notée.
function calculatedFirstDue(history: TreatmentWithHistory, rhythm: TreatmentRhythm): string | null {
  const lastNotedOn = lastNotedDueOn(history)
  if (lastNotedOn === null) return null
  try {
    return treatmentScheduleOf(history, lastNotedOn).newPeriod(
      rhythm.frequency,
      sortedTimes(rhythm.times),
    ).firstDueOn
  } catch {
    return null
  }
}

function proposalHelp(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
  rhythm: TreatmentRhythm,
  proposedOn: string,
  today: string,
): NextDoseHelp | null {
  if (!hasNote(schedule)) return null
  const calculatedOn = calculatedFirstDue(history, rhythm)
  return calculatedOn !== null && calculatedOn < today && proposedOn === today
    ? { kind: 'calculated-passed', on: calculatedOn }
    : { kind: 'calculated', on: proposedOn }
}

function resolveOpened(
  period: TreatmentPeriodRecord,
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm,
  chosenOn: string | null,
  today: string,
  change: 'open' | 'correct',
): Resolved {
  const schedule = treatmentScheduleOf(history, today)
  const { startsOn, firstDueOn } = schedule.newPeriod(rhythm.frequency, sortedTimes(rhythm.times))
  return {
    period,
    change,
    proposesFirstDue: true,
    nextDose: {
      change: 'first-due',
      proposedOn: firstDueOn,
      earliest: startsOn,
      latest: rhythm.endsOn,
      refusal: null,
      help: proposalHelp(history, schedule, rhythm, firstDueOn, today),
      moveAfterEnd: null,
    },
    settings: withRhythm(
      { ...settingsOf(period), startsOn, firstDueOn: chosenOn ?? firstDueOn },
      rhythm,
    ),
    move: null,
  }
}

function overdueHelp(due: Due, today: string): NextDoseHelp | null {
  return due.dueOn < today ? { kind: 'overdue', since: due.dueOn } : null
}

function droppedHelp(
  schedule: TreatmentSchedule,
  periodId: string,
  firstDueOn: string,
): NextDoseHelp | null {
  const count = [...schedule.unloggedDoses, ...schedule.currentDoses].filter(
    (due) => due.periodId === periodId && due.dueOn < firstDueOn,
  ).length
  return count > 0 ? { kind: 'dropped', count } : null
}

function resolveMoved(
  period: TreatmentPeriodRecord,
  schedule: TreatmentSchedule,
  due: Due,
  settings: TreatmentPeriodSettings,
  chosenOn: string | null,
  today: string,
): Resolved {
  const bounds = schedule.moveBounds(due)
  const refusal = schedule.moveRefusal(due)
  const latest = settings.endsOn
  const line = moveArrivingOn(schedule, due)
  const arrivesAfterEnd = line !== undefined && latest !== null && due.dueOn > latest
  const inBounds =
    bounds !== null &&
    chosenOn !== null &&
    chosenOn !== due.dueOn &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (latest === null || chosenOn <= latest)
  const calculated: NextDoseHelp | null = hasNote(schedule, period.id)
    ? { kind: 'calculated', on: line?.dueOn ?? due.dueOn }
    : null
  return {
    period,
    change: 'correct',
    proposesFirstDue: false,
    nextDose: {
      change: 'move',
      proposedOn: due.dueOn,
      earliest: bounds?.earliest ?? today,
      latest,
      refusal,
      help:
        refusal !== null ? { kind: 'refused', refusal } : (overdueHelp(due, today) ?? calculated),
      moveAfterEnd: !arrivesAfterEnd ? null : isAdvanced(line) ? 'advanced' : 'postponed',
    },
    settings,
    move: inBounds ? schedule.move(due, chosenOn) : null,
  }
}

function resolveCorrected(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  chosenOn: string | null,
  today: string,
): Resolved {
  const corrected = withRhythm(settingsOf(period), rhythm)
  const schedule = treatmentScheduleOf(withPeriodSettings(history, period.id, corrected), today)
  const due = schedule.currentDoses[0]
  if (due === undefined || schedule.nextDoseChange === null) {
    // Un report dont l'arrivée dépasse la date de fin saisie : la dose se lit avec la date de fin d'avant.
    const kept = treatmentScheduleOf(
      withPeriodSettings(history, period.id, { ...corrected, endsOn: period.endsOn }),
      today,
    )
    const moved = kept.currentDoses[0]
    if (moved !== undefined && moveArrivingOn(kept, moved) !== undefined) {
      return resolveMoved(period, kept, moved, corrected, chosenOn, today)
    }
    return {
      period,
      change: 'correct',
      nextDose: null,
      settings: corrected,
      move: null,
      proposesFirstDue: false,
    }
  }
  if (schedule.nextDoseChange === 'move') {
    return resolveMoved(period, schedule, due, corrected, chosenOn, today)
  }

  const previous = orderPeriods(history.periods).at(-2)
  const changed = chosenOn !== null && chosenOn !== due.dueOn
  const firstDueOn = changed ? chosenOn : corrected.firstDueOn
  return {
    period,
    change: 'correct',
    proposesFirstDue: false,
    nextDose: {
      change: 'first-due',
      proposedOn: due.dueOn,
      earliest: latestOf([today, previous?.startsOn]) ?? today,
      latest: rhythm.endsOn,
      refusal: null,
      help:
        (changed && isCalendarDay(chosenOn) ? droppedHelp(schedule, period.id, chosenOn) : null) ??
        overdueHelp(due, today),
      moveAfterEnd: null,
    },
    settings: {
      ...corrected,
      firstDueOn,
      startsOn: firstDueOn < corrected.startsOn ? firstDueOn : corrected.startsOn,
    },
    move: null,
  }
}

// TR-7 : une période ouverte par « Modifier » et encore sans prise se recalcule comme si elle s'ouvrait.
function historyBeforeReopening(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
): TreatmentWithHistory | null {
  const previous = orderPeriods(history.periods).at(-2)
  const followsOpenPeriod =
    previous !== undefined &&
    previous.stoppedOn === null &&
    (previous.endsOn === null || period.startsOn <= previous.endsOn)
  const changesSchedule =
    JSON.stringify([period.frequency, sortedTimes(period.times)]) !==
    JSON.stringify([rhythm.frequency, sortedTimes(rhythm.times)])
  if (!followsOpenPeriod || !changesSchedule) return null
  return {
    ...history,
    periods: history.periods.filter(({ id }) => id !== period.id),
    doses: history.doses.filter(({ periodId }) => periodId !== period.id),
  }
}

function resolve(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  chosenOn: string | null,
  today: string,
): Resolved {
  const base = treatmentScheduleOf(history, today)
  const period = currentPeriod(history, base)
  if (period.stoppedOn !== null || base.phase === 'ended') {
    return {
      period,
      change: 'locked',
      nextDose: null,
      settings: settingsOf(period),
      move: null,
      proposesFirstDue: false,
    }
  }
  const live = withoutStale(history, base)
  const next = rhythm ?? rhythmOf(period)
  if (base.currentPeriodHasDose) {
    return changesRhythm(period, next)
      ? resolveOpened(period, live, next, chosenOn, today, 'open')
      : resolveCorrected(live, period, next, chosenOn, today)
  }
  const before = historyBeforeReopening(live, period, next)
  return before === null
    ? resolveCorrected(live, period, next, chosenOn, today)
    : resolveOpened(period, before, next, chosenOn, today, 'correct')
}

/**
 * Ce que « Modifier » ferait des réglages saisis : correction ou nouvelle période, et la
 * « Prochaine dose » à proposer, avec son aide pour la date `chosenOn` saisie. `rhythm` vaut `null`
 * tant que la saisie n'est pas valide : les réglages enregistrés servent alors. Lève une
 * `RangeError` quand l'historique est illisible.
 */
export function editionDraft(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  today: string,
  chosenOn: string | null = null,
): EditionDraft {
  const { period, change, nextDose } = resolve(history, rhythm, chosenOn, today)
  return { period, change, nextDose }
}

type DateIssue = { path: 'nextDoseOn' | 'endsOn'; message: string }

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const { period, change, nextDose, proposesFirstDue } = resolve(history, data, null, today)
  if (change === 'locked') return []

  const issues: DateIssue[] = []
  const chosenOn = nextDose === null ? null : data.nextDoseOn
  const changed = nextDose !== null && chosenOn !== null && chosenOn !== nextDose.proposedOn
  if (changed) {
    if (nextDose.refusal !== null) issues.push({ path: 'nextDoseOn', message: 'refused' })
    else if (chosenOn < nextDose.earliest) issues.push({ path: 'nextDoseOn', message: 'tooEarly' })
    else if (nextDose.latest !== null && chosenOn > nextDose.latest) {
      issues.push({ path: 'nextDoseOn', message: 'afterEnd' })
    }
  }
  if (data.endsOn === null || issues.length > 0) return issues

  if (nextDose !== null && nextDose.moveAfterEnd !== null && !changed) {
    const reason =
      nextDose.moveAfterEnd === 'advanced' ? 'beforeAdvancedDose' : 'beforePostponedDose'
    return [{ path: 'endsOn', message: reason }]
  }
  const setsFirstDue = nextDose?.change === 'first-due' && (proposesFirstDue || changed)
  if (setsFirstDue && data.endsOn < (chosenOn ?? nextDose.proposedOn)) {
    issues.push({ path: 'endsOn', message: 'beforeNextDose' })
  } else if (change === 'correct' && data.endsOn !== period.endsOn) {
    const lastDoseOn = lastNotedDueOn(history, period.id)
    if (data.endsOn < period.firstDueOn && !setsFirstDue) {
      issues.push({ path: 'endsOn', message: 'beforeFirstDose' })
    } else if (lastDoseOn !== null && data.endsOn < lastDoseOn) {
      issues.push({ path: 'endsOn', message: 'beforeLastDose' })
    }
  }
  return issues
}

/** Le schéma de « Modifier » avec ses bornes de dates, celles du moteur pour « Prochaine dose ». */
export function treatmentEditionSchemaFor(history: TreatmentWithHistory, today: string) {
  return treatmentEditionSchema.superRefine((data, context) => {
    for (const { path, message } of editionIssues(history, data, today)) {
      context.addIssue({ code: 'custom', path: [path], message })
    }
  })
}

function doseWrites(schedule: TreatmentSchedule, move: MovedDose | null, doseId: string) {
  const writes: PlannedDoseWrite[] = schedule.staleDoseIds.map((id) => ({ action: 'delete', id }))
  if (move === null || move.action === 'none') return writes
  if (move.action === 'delete') return [...writes, { action: 'delete' as const, id: move.doseId }]
  return [
    ...writes,
    move.action === 'create'
      ? { action: 'create' as const, id: doseId, dose: move.dose }
      : { action: 'rewrite' as const, id: move.doseId, dose: move.dose },
  ]
}

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(history, today).parse(input)
  const { period, change, settings, move } = resolve(history, data, data.nextDoseOn, today)
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const doses = doseWrites(treatmentScheduleOf(history, today), move, ids.doseId)
  if (change === 'open') {
    return { treatment, period: { action: 'open', id: ids.periodId, settings }, doses }
  }
  return {
    treatment,
    period: sameSettings(settings, settingsOf(period)) ? null : { action: 'correct', settings },
    doses,
  }
}

export function creationPlan(input: TreatmentCreationInput, id: string): NewTreatmentPlan {
  const { animalId, name, type, firstDoseOn, ...rhythm } = treatmentCreationSchema.parse(input)
  return {
    id,
    animalId,
    name,
    type,
    settings: withRhythm(
      {
        startsOn: firstDoseOn,
        firstDueOn: firstDoseOn,
        reminderOffsetMinutes: null,
        reminderTime: null,
        ...rhythm,
      },
      rhythm,
    ),
  }
}

export type ResumptionDraft = {
  period: TreatmentPeriodRecord
  /** Faux tant que le traitement est en cours. */
  canResume: boolean
  startedOn: string
  /** Fin de la dernière période : son arrêt, sinon sa date de fin. */
  endedOn: string | null
  /** Durée à reproduire, première et dernière journée comprises ; `null` sans date de fin. */
  durationDays: number | null
  /** Date de fin qui reproduit cette durée à partir de la première prise choisie. */
  endsOnFor(firstDoseOn: string): string | null
}

type ResumptionFloor = { from: string; after: string | null }

// La nouvelle période commence sans rien retirer à la précédente : dès le jour de l'arrêt (G3), ou
// après la date de fin et la dernière prise notée d'une période finie.
function resumptionFloor(history: TreatmentWithHistory, period: TreatmentPeriodRecord) {
  const after = latestOf([
    lastNotedDueOn(history, period.id),
    period.stoppedOn === null ? period.endsOn : null,
  ])
  const closedBeforeStop = period.stoppedOn !== null && after !== null && after <= period.stoppedOn
  return {
    from: latestOf([period.startsOn, period.stoppedOn]) ?? period.startsOn,
    after: closedBeforeStop ? null : after,
  } satisfies ResumptionFloor
}

function respectsFloor({ from, after }: ResumptionFloor, firstDoseOn: string): boolean {
  return firstDoseOn >= from && (after === null || firstDoseOn > after)
}

export function resumptionDraft(history: TreatmentWithHistory, today: string): ResumptionDraft {
  const schedule = treatmentScheduleOf(history, today)
  const period = currentPeriod(history, schedule)
  const durationDays =
    period.endsOn === null
      ? null
      : differenceInCalendarDays(parseISO(period.endsOn), parseISO(period.firstDueOn)) + 1
  return {
    period,
    canResume: schedule.phase === 'stopped' || schedule.phase === 'ended',
    startedOn: period.firstDueOn,
    endedOn: period.stoppedOn ?? period.endsOn,
    durationDays,
    endsOnFor: (firstDoseOn) =>
      durationDays === null || durationDays < 1 || !isCalendarDay(firstDoseOn)
        ? null
        : formatISO(addDays(parseISO(firstDoseOn), durationDays - 1), { representation: 'date' }),
  }
}

/** Le schéma de « Reprendre », la première prise après la dernière période. */
export function treatmentResumptionSchemaFor(history: TreatmentWithHistory, today: string) {
  const { period } = resumptionDraft(history, today)
  const floor = resumptionFloor(history, period)
  return treatmentResumptionSchema.refine(({ firstDoseOn }) => respectsFloor(floor, firstDoseOn), {
    path: ['firstDoseOn'],
    message: 'beforePreviousPeriod',
  })
}

/** Lève pour un traitement en cours ou une saisie refusée ; la période précédente n'est jamais touchée. */
export function resumptionPlan(
  history: TreatmentWithHistory,
  input: TreatmentResumptionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const { period, canResume } = resumptionDraft(history, today)
  if (!canResume) throw new Error(`Traitement en cours, rien à reprendre : ${history.id}`)
  const { firstDoseOn, ...rhythm } = treatmentResumptionSchemaFor(history, today).parse(input)
  return {
    treatment: null,
    period: {
      action: 'open',
      id: ids.periodId,
      settings: withRhythm(
        { ...settingsOf(period), startsOn: firstDoseOn, firstDueOn: firstDoseOn },
        rhythm,
      ),
    },
    doses: doseWrites(treatmentScheduleOf(history, today), null, ids.doseId),
  }
}
