import type { z } from 'zod'

import { plannedDoseWrites } from './treatment-dose-writes'
import { treatmentScheduleOf } from './treatment-schedule-adapter'
import {
  assertReadable,
  changesRhythm,
  changesSchedule,
  currentPeriod,
  draftPeriod,
  lastNotedDueOn,
  rhythmOf,
  sameSettings,
  settingsOf,
  withPeriodSettings,
  withRhythm,
  type PlanIds,
} from './treatment-settings'
import { lostDays, pendingDaysAfter } from './treatment-shift-box'
import type { PlannedDoseWrite, TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import {
  treatmentEditionSchema,
  type PastDuesChoice,
  type TreatmentEditionInput,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { isCalendarDay, latestOf } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import {
  isAdvanced,
  isNoteLine,
  orderPeriods,
  type Due,
  type MoveRefusal,
  type MovedDose,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'

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
  /** Date reprise du calendrier en cours, report compris (Q37). */
  | { kind: 'scheduled'; on: string }
  /** La date calculée est passée : aujourd'hui est proposé à sa place. */
  | { kind: 'calculated-passed'; on: string }

/**
 * La case « Décaler aussi les doses suivantes » sous la date choisie : les journées qui suivraient la
 * dose déplacée, et celles que le décalage ferait sortir de la date de fin (Q4).
 */
export type NextDoseShift = {
  following: string[]
  /** Case décochée ; vide quand la dose ne peut pas aller seule à cette date. */
  followingAlone: string[]
  lost: string[]
  /** Dernier jour d'un report seul (Q2 a), `null` sans autre borne que la date de fin. */
  aloneLatest: string | null
}

export type NextDoseDraft = {
  /** `first-due` : la date choisie devient la première échéance de la période ; `move` : une ligne « Reportée / Avancée ». */
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** La date de fin saisie, ou la veille de la dose suivante pour un report seul ; `null` sans borne. */
  latest: string | null
  refusal: MoveRefusal | null
  help: NextDoseHelp | null
  /** `null` : pas de case, la date ne déplace aucune dose ou la dose ne peut aller seule. */
  shift: NextDoseShift | null
  /** N2 : la case rouverte telle qu'elle a été laissée, cochée sans report ou avec son décalage. */
  shiftInitial: boolean
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
  /** La première échéance que chaque réponse écrirait ; `null` sans question à poser. */
  pastDuesNextDose: Record<PastDuesChoice, string> | null
}

type Resolved = Omit<EditionDraft, 'farthestMove' | 'pastDues' | 'pastDuesNextDose'> & {
  settings: TreatmentPeriodSettings
  /** Origine de la grille de la période écrite (le 31 d'un mensuel), sa première échéance sinon. */
  referenceOn: string
  move: MovedDose | null
  /** Ligne de déplacement de la prochaine dose, que la saisie peut réécrire. */
  movedLineId: string | null
  /** La première échéance vient de `newPeriod` : la date de fin doit la suivre. */
  proposesFirstDue: boolean
}

function hasNote(schedule: TreatmentSchedule, periodId?: string): boolean {
  return schedule.doses.some(
    (dose) => isNoteLine(dose) && (periodId === undefined || dose.periodId === periodId),
  )
}

function withoutStaleDoses(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
): TreatmentWithHistory {
  const stale = new Set(schedule.staleDoseIds)
  return { ...history, doses: history.doses.filter(({ id }) => !stale.has(id)) }
}

function moveArrivingOn(schedule: TreatmentSchedule, due: Due) {
  return schedule.doses.find(
    (dose) =>
      dose.status === 'postponed' &&
      dose.periodId === due.periodId &&
      dose.nextDueDate === due.dueOn,
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
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  proposedOn: string,
  today: string,
): NextDoseHelp | null {
  const todayHelp: NextDoseHelp | null = proposedOn === today ? { kind: 'today' } : null
  if (!hasNote(schedule)) return todayHelp
  if (!changesSchedule(period, rhythm)) {
    // Q37 : la date est celle du calendrier en cours, report compris, pas un calcul depuis la dernière prise.
    const due = schedule.currentDoses[0]
    if (due === undefined) return null
    if (due.dueOn === proposedOn) return { kind: 'scheduled', on: proposedOn }
    return proposedOn === today ? overdueHelp(due, today) : null
  }
  const calculatedOn = calculatedFirstDue(history, rhythm)
  if (calculatedOn === proposedOn) return { kind: 'calculated', on: proposedOn }
  // G24 : la journée à venir entamée en avance reste la prochaine dose.
  if (proposedOn > today && schedule.currentDoses[0]?.dueOn === proposedOn) {
    return { kind: 'scheduled', on: proposedOn }
  }
  return calculatedOn !== null && calculatedOn < today && proposedOn === today
    ? { kind: 'calculated-passed', on: calculatedOn }
    : todayHelp
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
  const writtenOn = chosenOn ?? firstDueOn
  return {
    period,
    change,
    proposesFirstDue: true,
    movedLineId: null,
    referenceOn: writtenOn === opened.firstDueOn ? opened.referenceOn : writtenOn,
    nextDose: {
      change: 'first-due',
      proposedOn: firstDueOn,
      earliest: today,
      latest: rhythm.endsOn,
      refusal: null,
      help: proposalHelp(history, schedule, period, rhythm, firstDueOn, today),
      shift: null,
      shiftInitial: true,
    },
    settings: withRhythm({ ...settingsOf(period), startsOn, firstDueOn: writtenOn }, rhythm),
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

function dosesWith(history: TreatmentWithHistory, { report, shift }: MovedDose, today: string) {
  const at = `${today}T23:59:59.999Z`
  const owner = { treatmentId: history.id, animalId: history.animalId, deletedAt: null }
  return [report, shift].reduce((doses, change, index) => {
    switch (change.action) {
      case 'none':
        return doses
      case 'delete':
        return doses.filter(({ id }) => id !== change.doseId)
      case 'rewrite':
        return doses.map((dose) =>
          dose.id === change.doseId ? { ...dose, ...change.dose, updatedAt: at } : dose,
        )
      case 'create':
        return [
          ...doses,
          { ...change.dose, ...owner, id: `apercu-${index}`, createdAt: at, updatedAt: at },
        ]
    }
  }, history.doses)
}

// La case n'apparaît que si la dose change vraiment de date et peut aller seule (Q2 a).
function shiftOf(
  book: TreatmentWithHistory,
  schedule: TreatmentSchedule,
  due: Due,
  chosenOn: string,
  today: string,
): NextDoseShift | null {
  const period = book.periods.find(({ id }) => id === due.periodId)
  const alone = schedule.moveBounds(due, false)
  if (period === undefined || alone === null) return null
  const checked = schedule.move(due, chosenOn, true)
  if (checked.report.action !== 'create' && checked.report.action !== 'rewrite') return null
  const followingWith = (moved: MovedDose) =>
    pendingDaysAfter(
      treatmentScheduleOf({ ...book, doses: dosesWith(book, moved, today) }, today),
      period,
      chosenOn,
    )
  const following = followingWith(checked)
  const fitsAlone = alone.latest === null || chosenOn <= alone.latest
  const followingAlone = fitsAlone ? followingWith(schedule.move(due, chosenOn, false)) : []
  const before = pendingDaysAfter(schedule, period, due.dueOn)
  return {
    following,
    followingAlone,
    lost: lostDays(before, following, period),
    aloneLatest: alone.latest,
  }
}

function resolveMoved(
  period: TreatmentPeriodRecord,
  book: TreatmentWithHistory,
  schedule: TreatmentSchedule,
  due: Due,
  settings: TreatmentPeriodSettings,
  { chosenOn, shiftsFollowing }: Choice,
  today: string,
): Resolved {
  const bounds = schedule.moveBounds(due)
  const refusal = schedule.moveRefusal(due)
  const alone = shiftsFollowing ? null : schedule.moveBounds(due, false)
  const latest = alone?.latest ?? settings.endsOn
  const line = moveArrivingOn(schedule, due)
  const inBounds =
    bounds !== null &&
    chosenOn !== null &&
    chosenOn !== due.dueOn &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (latest === null || chosenOn <= latest)
  const shift =
    bounds !== null &&
    chosenOn !== null &&
    chosenOn !== due.dueOn &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (settings.endsOn === null || chosenOn <= settings.endsOn)
      ? shiftOf(book, schedule, due, chosenOn, today)
      : null
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
      shift,
      shiftInitial:
        line === undefined ||
        schedule.doses.some(
          (dose) =>
            dose.status === 'shift' && dose.periodId === line.periodId && dose.dueOn === line.dueOn,
        ),
    },
    settings,
    referenceOn: period.referenceOn,
    move: inBounds ? schedule.move(due, chosenOn, shiftsFollowing) : null,
  }
}

function resolveCorrected(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  choice: Choice,
  today: string,
): Resolved {
  const { chosenOn } = choice
  const corrected = withRhythm(settingsOf(period), rhythm)
  const book = withPeriodSettings(history, period.id, corrected)
  const schedule = treatmentScheduleOf(book, today)
  const due = schedule.currentDoses[0]
  if (due === undefined || schedule.nextDoseChange === null) {
    // Un report dont l'arrivée dépasse la date de fin saisie : la dose se lit avec la date de fin d'avant.
    const keptBook = withPeriodSettings(history, period.id, { ...corrected, endsOn: period.endsOn })
    const kept = treatmentScheduleOf(keptBook, today)
    const moved = kept.currentDoses[0]
    if (moved !== undefined && moveArrivingOn(kept, moved) !== undefined) {
      return resolveMoved(period, keptBook, kept, moved, corrected, choice, today)
    }
    return {
      period,
      change: 'correct',
      nextDose: null,
      settings: corrected,
      referenceOn: period.referenceOn,
      move: null,
      proposesFirstDue: false,
      movedLineId: null,
    }
  }
  if (schedule.nextDoseChange === 'move') {
    return resolveMoved(period, book, schedule, due, corrected, choice, today)
  }

  const previous = orderPeriods(history.periods).at(-2)
  const changed = chosenOn !== null && chosenOn !== due.dueOn
  const firstDueOn = changed ? chosenOn : corrected.firstDueOn
  const sameGrid =
    firstDueOn === period.firstDueOn &&
    JSON.stringify(corrected.frequency) === JSON.stringify(period.frequency)
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
      shift: null,
      shiftInitial: true,
    },
    settings: {
      ...corrected,
      firstDueOn,
      startsOn: firstDueOn < corrected.startsOn ? firstDueOn : corrected.startsOn,
    },
    referenceOn: sameGrid ? period.referenceOn : firstDueOn,
    move: null,
    movedLineId: null,
  }
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

/** La date saisie dans « Prochaine dose » et la case « Décaler aussi les doses suivantes ». */
type Choice = { chosenOn: string | null; shiftsFollowing: boolean }

function resolve(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  choice: Choice,
  today: string,
  pastDuesChoice?: PastDuesChoice,
): Answered {
  const { chosenOn } = choice
  const base = treatmentScheduleOf(history, today)
  const period = currentPeriod(history, base)
  if (period.stoppedOn !== null || base.phase === 'ended') {
    return {
      period,
      change: 'locked',
      nextDose: null,
      settings: settingsOf(period),
      referenceOn: period.referenceOn,
      move: null,
      proposesFirstDue: false,
      movedLineId: null,
      pastDues: [],
    }
  }
  const live = withoutStaleDoses(history, base)
  const next = rhythm ?? rhythmOf(period)
  if (base.currentPeriodHasDose) {
    const resolved = changesRhythm(period, next)
      ? resolveOpened(period, live, next, chosenOn, today, 'open')
      : resolveCorrected(live, period, next, choice, today)
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
    : resolveCorrected(live, period, next, choice, today)
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
  shiftsFollowing = true,
): EditionDraft {
  const { period, change, nextDose, pastDues } = resolve(
    history,
    rhythm,
    { chosenOn, shiftsFollowing },
    today,
  )
  const farthestMove = change === 'locked' ? null : farthestMoveOf(history, period.id, today, null)
  const touchedOn = chosenOn !== nextDose?.proposedOn ? chosenOn : null
  // Aucune date n'est écrite sans avoir été vue : la date saisie quand elle vaut pour ce chemin, sinon celle qu'il calcule.
  const nextDoseFor = (choice: PastDuesChoice): string => {
    const answered = resolve(
      history,
      rhythm,
      { chosenOn: null, shiftsFollowing },
      today,
      choice,
    ).nextDose
    if (answered === null) return touchedOn ?? today
    const fits =
      touchedOn !== null &&
      touchedOn >= answered.earliest &&
      (answered.latest === null || touchedOn <= answered.latest)
    return fits ? touchedOn : answered.proposedOn
  }
  return {
    period,
    change,
    nextDose,
    farthestMove,
    pastDues,
    pastDuesNextDose:
      pastDues.length === 0 ? null : { keep: nextDoseFor('keep'), drop: nextDoseFor('drop') },
  }
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

export type NextDoseOnIssueReason = 'refused' | 'tooEarly' | 'afterEnd' | 'afterNextDose'
export type EndsOnIssueReason =
  | 'beforeFirstDose'
  | 'beforeNextDose'
  | 'beforeLastDose'
  | 'beforePostponedDose'
  | 'beforeAdvancedDose'
  | 'beforeFarPostponedDose'
  | 'beforeFarAdvancedDose'

type DateIssue =
  | { path: 'nextDoseOn'; message: NextDoseOnIssueReason }
  | { path: 'endsOn'; message: EndsOnIssueReason }
  | { path: 'pastDues'; message: 'required' }

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const shiftsFollowing = data.shiftsFollowing ?? true
  const { period, change, nextDose, proposesFirstDue, movedLineId, pastDues } = resolve(
    history,
    data,
    { chosenOn: null, shiftsFollowing },
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
      const pastNext = !shiftsFollowing && (data.endsOn === null || chosenOn <= data.endsOn)
      issues.push({ path: 'nextDoseOn', message: pastNext ? 'afterNextDose' : 'afterEnd' })
    }
  }
  if (data.endsOn === null || issues.length > 0) return issues

  const farthest =
    change === 'correct'
      ? farthestMoveOf(history, period.id, today, changed ? movedLineId : null)
      : null
  if (farthest !== null && data.endsOn !== period.endsOn && data.endsOn < farthest.arrivesOn) {
    const which = farthest.doseId === movedLineId ? '' : 'Far'
    const reason: EndsOnIssueReason = farthest.advanced
      ? `before${which}AdvancedDose`
      : `before${which}PostponedDose`
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

function changesGrid(period: TreatmentPeriodRecord, settings: TreatmentPeriodSettings): boolean {
  return (
    settings.firstDueOn !== period.firstDueOn ||
    JSON.stringify(settings.frequency) !== JSON.stringify(period.frequency)
  )
}

// Corriger une période sans prise refixe sa grille : ses décalages restés seuls partent avec, ses
// prises en plus restent.
function shiftDeletes(
  history: TreatmentWithHistory,
  periodId: string,
  writes: PlannedDoseWrite[],
): PlannedDoseWrite[] {
  const lines = history.doses.filter(
    (dose) => dose.periodId === periodId && dose.status !== 'extra',
  )
  if (lines.some((dose) => dose.status !== 'shift')) return []
  const written = new Set(writes.map(({ id }) => id))
  return lines
    .filter(({ id }) => !written.has(id))
    .map(({ id }): PlannedDoseWrite => ({ action: 'delete', id }))
}

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(history, today).parse(input)
  const { period, change, settings, referenceOn, move } = resolve(
    history,
    data,
    { chosenOn: data.nextDoseOn, shiftsFollowing: data.shiftsFollowing ?? true },
    today,
    data.pastDues,
  )
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const doses = plannedDoseWrites(treatmentScheduleOf(history, today), move, ids)
  const corrects = change === 'correct' && !sameSettings(settings, settingsOf(period))
  const plan: TreatmentPlanWrite =
    change === 'open'
      ? { treatment, period: { action: 'open', id: ids.periodId, settings, referenceOn }, doses }
      : {
          treatment,
          period: corrects ? { action: 'correct', settings, referenceOn } : null,
          doses:
            corrects && changesGrid(period, settings)
              ? [...doses, ...shiftDeletes(history, period.id, doses)]
              : doses,
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
        ? [
            ...history.periods,
            {
              ...draftPeriod(period.settings, at),
              id: period.id,
              referenceOn: period.referenceOn ?? period.settings.firstDueOn,
            },
          ]
        : history.periods.map((other) =>
            other.id === current.id
              ? {
                  ...other,
                  ...period.settings,
                  referenceOn: period.referenceOn ?? period.settings.firstDueOn,
                }
              : other,
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
