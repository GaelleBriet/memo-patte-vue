import {
  hasNote,
  overdueHelp,
  type EditionResolution,
  type NextDoseChoice,
  type NextDoseHelp,
} from './treatment-edition-resolution'
import { moveArrivingOn, resolveMoved } from './treatment-next-dose-move'
import { treatmentScheduleOf } from './treatment-schedule-adapter'
import {
  changesRhythm,
  changesSchedule,
  currentPeriod,
  lastNotedDueOn,
  rhythmOf,
  settingsOf,
  withPeriodSettings,
  withRhythm,
} from './treatment-settings'
import type { PastDuesChoice, TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { isCalendarDay, latestOf } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import {
  isAdvanced,
  orderPeriods,
  type Due,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'

/** Le déplacement en vigueur qui arrive le plus tard dans la période en cours. */
export type FarthestMove = { doseId: string; arrivesOn: string; advanced: boolean }

function withoutStaleDoses(
  history: TreatmentWithHistory,
  schedule: TreatmentSchedule,
): TreatmentWithHistory {
  const stale = new Set(schedule.staleDoseIds)
  return { ...history, doses: history.doses.filter(({ id }) => !stale.has(id)) }
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
): EditionResolution {
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

function resolveCorrected(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  choice: NextDoseChoice,
  today: string,
): EditionResolution {
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

type Answered = EditionResolution & { pastDues: Due[] }

export function resolve(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  choice: NextDoseChoice,
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

// Q30 : les déplacements que le moteur garde en vigueur dans la période, sauf ceux dont l'arrivée est notée.
export function farthestMoveOf(
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
