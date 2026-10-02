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
  type PastDuesChoice,
  type TreatmentCreationInput,
  type TreatmentEditionInput,
  type TreatmentResumptionInput,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import {
  treatmentPeriodSettingsSchema,
  type TreatmentPeriodRecord,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import {
  isAdvanced,
  ScheduleTooLongError,
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
  /** Aucune prise dans tout le traitement : faute de référence, aujourd'hui est proposé. */
  | { kind: 'today' }
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
}

/** Le déplacement en vigueur qui arrive le plus tard dans la période en cours. */
export type FarthestMove = { doseId: string; arrivesOn: string; advanced: boolean }

export type EditionDraft = {
  period: TreatmentPeriodRecord
  /** `locked` : traitement arrêté ou fini, seuls le nom et le type se corrigent ; `open` : nouvelle période (TR-28). */
  change: 'locked' | 'correct' | 'open'
  /** `null` : aucune dose à venir. */
  nextDose: NextDoseDraft | null
  /** La date de fin ne passe pas avant son arrivée. */
  farthestMove: FarthestMove | null
  /** Échéances tombées que le nouveau rythme laisserait à renseigner ou retirerait : la question est à poser. */
  pastDues: Due[]
}

export type PlanIds = { periodId: string; doseId: string }

type Resolved = Omit<EditionDraft, 'farthestMove' | 'pastDues'> & {
  settings: TreatmentPeriodSettings
  move: MovedDose | null
  /** Ligne de déplacement de la prochaine dose, que la saisie peut réécrire. */
  movedLineId: string | null
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

// La date calculée, sans le plancher d'aujourd'hui : le moteur la rend quand il se place au jour de
// la dernière prise notée. Rendue ce jour-là même (journée incomplète, Q24), elle n'apprend rien.
function calculatedFirstDue(history: TreatmentWithHistory, rhythm: TreatmentRhythm): string | null {
  const lastNotedOn = lastNotedDueOn(history)
  if (lastNotedOn === null) return null
  try {
    const { firstDueOn } = treatmentScheduleOf(history, lastNotedOn).newPeriod(
      rhythm.frequency,
      sortedTimes(rhythm.times),
    )
    return firstDueOn > lastNotedOn ? firstDueOn : null
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
  if (!hasNote(schedule)) return proposedOn === today ? { kind: 'today' } : null
  const calculatedOn = calculatedFirstDue(history, rhythm)
  if (calculatedOn === null || calculatedOn === proposedOn) {
    return { kind: 'calculated', on: proposedOn }
  }
  if (proposedOn !== today) return null
  // Q36 : la dose du jour ouvre la période, la date ne vient pas de la dernière prise.
  return calculatedOn < today ? { kind: 'calculated-passed', on: calculatedOn } : { kind: 'today' }
}

function resolveOpened(
  period: TreatmentPeriodRecord,
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm,
  chosenOn: string | null,
  today: string,
  change: 'open' | 'correct',
): Resolved {
  // Une période corrigée se recalcule au jour de son ouverture : l'historique d'avant s'arrêtait là.
  const openedOn = change === 'correct' && period.startsOn < today ? period.startsOn : today
  const schedule = treatmentScheduleOf(history, openedOn)
  const opened = schedule.newPeriod(rhythm.frequency, sortedTimes(rhythm.times))
  const firstDueOn = opened.firstDueOn < today ? today : opened.firstDueOn
  const startsOn = change === 'open' ? opened.startsOn : period.startsOn
  return {
    period,
    change,
    proposesFirstDue: true,
    movedLineId: null,
    nextDose: {
      change: 'first-due',
      proposedOn: firstDueOn,
      earliest: today,
      latest: rhythm.endsOn,
      refusal: null,
      help: proposalHelp(history, schedule, rhythm, firstDueOn, today),
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
  today: string,
): NextDoseHelp | null {
  // Une dose du jour est déplacée, pas perdue : seules comptent les doses non renseignées ou en retard.
  const overdue = schedule.currentDoses.filter((due) => due.dueOn < today)
  const count = [...schedule.unloggedDoses, ...overdue].filter(
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
    movedLineId: line?.id ?? null,
    nextDose: {
      change: 'move',
      proposedOn: due.dueOn,
      earliest: bounds?.earliest ?? today,
      latest,
      refusal,
      help:
        refusal !== null ? { kind: 'refused', refusal } : (overdueHelp(due, today) ?? calculated),
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
      movedLineId: null,
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
        (changed && isCalendarDay(chosenOn)
          ? droppedHelp(schedule, period.id, chosenOn, today)
          : null) ?? overdueHelp(due, today),
    },
    settings: {
      ...corrected,
      firstDueOn,
      startsOn: firstDueOn < corrected.startsOn ? firstDueOn : corrected.startsOn,
    },
    move: null,
    movedLineId: null,
  }
}

function changesSchedule(period: TreatmentPeriodRecord, rhythm: TreatmentRhythm): boolean {
  return (
    JSON.stringify([period.frequency, sortedTimes(period.times)]) !==
    JSON.stringify([rhythm.frequency, sortedTimes(rhythm.times)])
  )
}

function withoutPeriod(history: TreatmentWithHistory, periodId: string): TreatmentWithHistory {
  return {
    ...history,
    periods: history.periods.filter(({ id }) => id !== periodId),
    doses: history.doses.filter((dose) => dose.periodId !== periodId),
  }
}

// TR-7 : une période ouverte par « Modifier » et encore sans prise se recalcule comme si elle s'ouvrait.
function followsOpenPeriod(history: TreatmentWithHistory, period: TreatmentPeriodRecord): boolean {
  const previous = orderPeriods(history.periods).at(-2)
  return (
    previous !== undefined &&
    previous.stoppedOn === null &&
    (previous.endsOn === null || period.startsOn <= previous.endsOn)
  )
}

// Doses non renseignées et dose en retard d'une période sans prise dont la fréquence ou les heures changent.
function pastDuesOf(
  schedule: TreatmentSchedule,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  today: string,
): Due[] {
  if (schedule.currentPeriodHasDose || !changesSchedule(period, rhythm)) return []
  const overdue = schedule.currentDoses.filter((due) => due.dueOn < today)
  return [...schedule.unloggedDoses, ...overdue].filter((due) => due.periodId === period.id)
}

type Answered = Resolved & { pastDues: Due[] }

function resolve(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  chosenOn: string | null,
  today: string,
  pastDuesChoice?: PastDuesChoice,
): Answered {
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
      movedLineId: null,
      pastDues: [],
    }
  }
  const live = withoutStale(history, base)
  const next = rhythm ?? rhythmOf(period)
  if (base.currentPeriodHasDose) {
    const resolved = changesRhythm(period, next)
      ? resolveOpened(period, live, next, chosenOn, today, 'open')
      : resolveCorrected(live, period, next, chosenOn, today)
    return { ...resolved, pastDues: [] }
  }
  const pastDues = pastDuesOf(treatmentScheduleOf(live, today), period, next, today)
  if (pastDues.length > 0 && pastDuesChoice === 'keep') {
    return { ...resolveOpened(period, live, next, chosenOn, today, 'open'), pastDues }
  }
  const recalculated =
    changesSchedule(period, next) && (pastDues.length > 0 || followsOpenPeriod(live, period))
  const resolved = recalculated
    ? resolveOpened(period, withoutPeriod(live, period.id), next, chosenOn, today, 'correct')
    : resolveCorrected(live, period, next, chosenOn, today)
  return { ...resolved, pastDues }
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
  const { period, change, nextDose, pastDues } = resolve(history, rhythm, chosenOn, today)
  const farthestMove = change === 'locked' ? null : farthestMoveOf(history, period.id, today, null)
  return { period, change, nextDose, farthestMove, pastDues }
}

// Q30 : les déplacements que le moteur garde en vigueur dans la période, sauf ceux dont l'arrivée est notée.
function farthestMoveOf(
  history: TreatmentWithHistory,
  periodId: string,
  today: string,
  exceptId: string | null,
): FarthestMove | null {
  const schedule = treatmentScheduleOf(history, today)
  const locked = new Set(schedule.lockedMoveIds)
  const farthest = schedule.doses
    .filter(
      (dose) =>
        dose.status === 'postponed' &&
        dose.periodId === periodId &&
        dose.id !== exceptId &&
        !locked.has(dose.id),
    )
    .reduce<(typeof schedule.doses)[number] | null>(
      (latest, dose) => (latest === null || dose.nextDueDate > latest.nextDueDate ? dose : latest),
      null,
    )
  return farthest === null
    ? null
    : { doseId: farthest.id, arrivesOn: farthest.nextDueDate, advanced: isAdvanced(farthest) }
}

type DateIssue = { path: 'nextDoseOn' | 'endsOn' | 'pastDues'; message: string }

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const { period, change, nextDose, proposesFirstDue, movedLineId, pastDues } = resolve(
    history,
    data,
    null,
    today,
    data.pastDues,
  )
  if (change === 'locked') return []
  if (pastDues.length > 0 && data.pastDues === undefined) {
    return [{ path: 'pastDues', message: 'required' }]
  }

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

  const farthest =
    change === 'correct'
      ? farthestMoveOf(history, period.id, today, changed ? movedLineId : null)
      : null
  if (farthest !== null && data.endsOn !== period.endsOn && data.endsOn < farthest.arrivesOn) {
    const which = farthest.doseId === movedLineId ? '' : 'Far'
    const reason = farthest.advanced ? `before${which}AdvancedDose` : `before${which}PostponedDose`
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
  const { period, change, settings, move } = resolve(
    history,
    data,
    data.nextDoseOn,
    today,
    data.pastDues,
  )
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const doses = doseWrites(treatmentScheduleOf(history, today), move, ids.doseId)
  const plan: TreatmentPlanWrite =
    change === 'open'
      ? { treatment, period: { action: 'open', id: ids.periodId, settings }, doses }
      : {
          treatment,
          period: sameSettings(settings, settingsOf(period))
            ? null
            : { action: 'correct', settings },
          doses,
        }
  assertReadable(historyAfter(history, period, plan, today), today)
  return plan
}

function historyAfter(
  history: TreatmentWithHistory,
  current: TreatmentPeriodRecord,
  plan: TreatmentPlanWrite,
  today: string,
): Pick<TreatmentWithHistory, 'periods' | 'doses'> {
  const at = `${today}T23:59:59.999Z`
  const stamps = {
    treatmentId: history.id,
    animalId: history.animalId,
    createdAt: at,
    updatedAt: at,
  }
  const { period } = plan
  const periods =
    period === null
      ? history.periods
      : period.action === 'open'
        ? [...history.periods, { ...draftPeriod(period.settings, at), id: period.id }]
        : history.periods.map((other) =>
            other.id === current.id ? { ...other, ...period.settings } : other,
          )
  const doses = plan.doses.reduce((lines, write) => {
    if (write.action === 'delete') return lines.filter(({ id }) => id !== write.id)
    if (write.action === 'create') {
      return [...lines, { ...write.dose, ...stamps, id: write.id, deletedAt: null }]
    }
    return lines.map((line) =>
      line.id === write.id ? { ...line, ...write.dose, updatedAt: at } : line,
    )
  }, history.doses)
  return { periods, doses }
}

/** Lève la `RangeError` du moteur quand l'app ne saurait pas relire cet historique. */
export function assertReadable(
  history: Pick<TreatmentWithHistory, 'periods' | 'doses'>,
  today: string,
): void {
  treatmentScheduleOf(history, today)
}

function isTooLong(cause: unknown): boolean {
  return cause instanceof ScheduleTooLongError
}

const DRAFT_ID = 'draft'

function draftPeriod(settings: TreatmentPeriodSettings, at: string): TreatmentPeriodRecord {
  return {
    ...settings,
    id: DRAFT_ID,
    treatmentId: DRAFT_ID,
    animalId: DRAFT_ID,
    stoppedOn: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

// Une première prise trop ancienne pour le rythme donnerait un calendrier que le moteur refuse de lire.
function startsTooFarBack(
  history: Pick<TreatmentWithHistory, 'periods' | 'doses'>,
  settings: TreatmentPeriodSettings,
  today: string,
): boolean {
  if (!treatmentPeriodSettingsSchema.safeParse(settings).success) return false
  const at = `${today}T23:59:59.999Z`
  try {
    assertReadable({ ...history, periods: [...history.periods, draftPeriod(settings, at)] }, today)
    return false
  } catch (cause) {
    if (isTooLong(cause)) return true
    throw cause
  }
}

function tooOld() {
  return { code: 'custom' as const, path: ['firstDoseOn'], message: 'tooOld' }
}

function creationSettings({
  firstDoseOn,
  ...rhythm
}: TreatmentRhythm & { firstDoseOn: string }): TreatmentPeriodSettings {
  return withRhythm(
    {
      startsOn: firstDoseOn,
      firstDueOn: firstDoseOn,
      reminderOffsetMinutes: null,
      reminderTime: null,
      ...rhythm,
    },
    rhythm,
  )
}

/** Le schéma de création, qui refuse une première prise que le moteur ne saurait pas relire. */
export function treatmentCreationSchemaFor(today: string) {
  return treatmentCreationSchema.superRefine((data, context) => {
    if (startsTooFarBack({ periods: [], doses: [] }, creationSettings(data), today)) {
      context.addIssue(tooOld())
    }
  })
}

export function creationPlan(
  input: TreatmentCreationInput,
  id: string,
  today: string,
): NewTreatmentPlan {
  const { animalId, name, type, ...plan } = treatmentCreationSchemaFor(today).parse(input)
  return { id, animalId, name, type, settings: creationSettings(plan) }
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
  return treatmentResumptionSchema
    .refine(({ firstDoseOn }) => respectsFloor(floor, firstDoseOn), {
      path: ['firstDoseOn'],
      message: 'beforePreviousPeriod',
    })
    .superRefine(({ firstDoseOn, ...rhythm }, context) => {
      const settings = withRhythm(
        { ...settingsOf(period), startsOn: firstDoseOn, firstDueOn: firstDoseOn },
        rhythm,
      )
      if (respectsFloor(floor, firstDoseOn) && startsTooFarBack(history, settings, today)) {
        context.addIssue(tooOld())
      }
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
