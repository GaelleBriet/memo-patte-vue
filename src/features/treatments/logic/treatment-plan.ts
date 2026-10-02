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
import type {
  Due,
  MoveRefusal,
  MovedDose,
  TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'
import { orderPeriods } from '@/shared/domain/treatment-schedule-plan'

type Edition = z.output<typeof treatmentEditionSchema>

export type NextDoseDraft = {
  /** `first-due` : la date choisie devient la première échéance de la période ; `move` : une ligne « Reportée / Avancée ». */
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** La date de fin saisie, `null` sans date de fin. */
  latest: string | null
  refusal: MoveRefusal | null
  /** Date calculée d'après la dernière prise ; `null` quand la période n'a pas de prise. */
  calculatedOn: string | null
}

export type EditionDraft = {
  period: TreatmentPeriodRecord
  /** `locked` : période arrêtée, seuls le nom et le type se corrigent ; `open` : nouvelle période (TR-28). */
  change: 'locked' | 'correct' | 'open'
  /** `null` : aucune dose à venir (traitement fini ou arrêté). */
  nextDose: NextDoseDraft | null
}

export type PlanIds = { periodId: string; doseId: string }

type Resolved = EditionDraft & { settings: TreatmentPeriodSettings; move: MovedDose | null }

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

function currentPeriod(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
): TreatmentPeriodRecord {
  const period = currentPeriodOf(history, schedule)
  if (period === null) throw new Error(`Traitement sans période : ${history.id}`)
  return period
}

function movedLineOrigin(schedule: TreatmentSchedule, due: Due): string {
  const line = schedule.doses.find(
    (dose) =>
      dose.status === 'postponed' &&
      dose.periodId === due.periodId &&
      dose.nextDueDate === due.dueOn,
  )
  return line?.dueOn ?? due.dueOn
}

function resolveOpened(
  period: TreatmentPeriodRecord,
  schedule: TreatmentSchedule,
  rhythm: TreatmentRhythm,
  chosenOn: string | null,
): Resolved {
  const { startsOn, firstDueOn } = schedule.newPeriod(rhythm.frequency, sortedTimes(rhythm.times))
  return {
    period,
    change: 'open',
    nextDose: {
      change: 'first-due',
      proposedOn: firstDueOn,
      earliest: startsOn,
      latest: rhythm.endsOn,
      refusal: null,
      calculatedOn: hasNote(schedule) ? firstDueOn : null,
    },
    settings: withRhythm(
      { ...settingsOf(period), startsOn, firstDueOn: chosenOn ?? firstDueOn },
      rhythm,
    ),
    move: null,
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
  const schedule = treatmentScheduleOf(
    {
      ...history,
      periods: history.periods.map((other) =>
        other.id === period.id ? { ...other, ...corrected } : other,
      ),
    },
    today,
  )
  const due = schedule.currentDoses[0]
  if (due === undefined || schedule.nextDoseChange === null) {
    return { period, change: 'correct', nextDose: null, settings: corrected, move: null }
  }
  const changed = chosenOn !== null && chosenOn !== due.dueOn

  if (schedule.nextDoseChange === 'correction') {
    const previous = orderPeriods(history.periods).at(-2)
    const firstDueOn = changed ? chosenOn : corrected.firstDueOn
    return {
      period,
      change: 'correct',
      nextDose: {
        change: 'first-due',
        proposedOn: due.dueOn,
        earliest: latestOf([today, previous?.startsOn]) ?? today,
        latest: rhythm.endsOn,
        refusal: null,
        calculatedOn: null,
      },
      settings: {
        ...corrected,
        firstDueOn,
        startsOn: firstDueOn < corrected.startsOn ? firstDueOn : corrected.startsOn,
      },
      move: null,
    }
  }

  const bounds = schedule.moveBounds(due)
  const refusal = schedule.moveRefusal(due)
  const inBounds =
    bounds !== null &&
    changed &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (bounds.latest === null || chosenOn <= bounds.latest)
  return {
    period,
    change: 'correct',
    nextDose: {
      change: 'move',
      proposedOn: due.dueOn,
      earliest: bounds?.earliest ?? today,
      latest: bounds?.latest ?? rhythm.endsOn,
      refusal,
      calculatedOn: hasNote(schedule, period.id) ? movedLineOrigin(schedule, due) : null,
    },
    settings: corrected,
    move: inBounds ? schedule.move(due, chosenOn) : null,
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
  if (period.stoppedOn !== null) {
    return { period, change: 'locked', nextDose: null, settings: settingsOf(period), move: null }
  }
  const live = withoutStale(history, base)
  const next = rhythm ?? rhythmOf(period)
  return base.currentPeriodHasDose && changesRhythm(period, next)
    ? resolveOpened(period, treatmentScheduleOf(live, today), next, chosenOn)
    : resolveCorrected(live, period, next, chosenOn, today)
}

/**
 * Ce que « Modifier » ferait des réglages saisis : correction ou nouvelle période, et la
 * « Prochaine dose » à proposer. `rhythm` vaut `null` tant que la saisie n'est pas valide : les
 * réglages enregistrés servent alors. Lève une `RangeError` quand l'historique est illisible.
 */
export function editionDraft(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  today: string,
): EditionDraft {
  const { period, change, nextDose } = resolve(history, rhythm, null, today)
  return { period, change, nextDose }
}

function lastNotedDueOn(history: TreatmentWithHistory, periodId: string): string | null {
  return latestOf(
    history.doses
      .filter((dose) => dose.periodId === periodId && dose.status !== 'postponed')
      .map((dose) => dose.dueOn),
  )
}

type DateIssue = { path: 'nextDoseOn' | 'endsOn'; message: string }

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const { period, change, nextDose } = resolve(history, data, null, today)
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

  const setsFirstDue = nextDose?.change === 'first-due' && (change === 'open' || changed)
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

// La nouvelle période commence après tout ce que la précédente a prévu ou noté.
function resumptionFloor(history: TreatmentWithHistory, period: TreatmentPeriodRecord) {
  return {
    from: latestOf([period.startsOn, period.stoppedOn]) ?? period.startsOn,
    after: latestOf([
      lastNotedDueOn(history, period.id),
      period.stoppedOn === null ? period.endsOn : null,
    ]),
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
