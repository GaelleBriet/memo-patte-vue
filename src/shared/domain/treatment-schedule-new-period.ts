import { isClockTime } from './clock-time'
import { checkFrequency, invalid } from './treatment-schedule-checks'
import { latestOf } from './calendar-day'
import { shiftDate } from './treatment-frequency'
import { isOffGrid, sequenceDues } from './treatment-schedule-sequence'
import {
  isShift,
  mergeDoses,
  nextDueAfter,
  pendingDues,
  planPeriod,
  positionOf,
  sameRhythm,
  sequenceAt,
  shiftOn,
} from './treatment-schedule-timeline'
import { dueOf, uniqueSorted } from './treatment-schedule-dues'
import { notedOn } from './treatment-schedule-state'
import type {
  Due,
  Frequency,
  NewPeriod,
  PeriodTimeline,
  State,
  TreatmentPeriodInput,
} from './treatment-schedule-types'

// Q8 : une prise qui n'a pas décalé la suite compte par son échéance, pas par sa date réelle.
function lastReference(state: State, frequency: Frequency): string | undefined {
  const lines = (steps: State['plans'][number]['steps']) => steps.filter((step) => !isShift(step))
  const plan = state.plans.filter(({ steps }) => lines(steps).length > 0).at(-1)
  const last = plan === undefined ? undefined : lines(plan.steps).at(-1)
  if (plan === undefined || last === undefined) return undefined
  if (last.kind === 'move') return last.dose.nextDueDate
  const reference = shiftOn(plan, last.dose)?.nextDueDate ?? last.dose.dueOn
  return shiftDate(reference, frequency, 1)
}

function keepsSettings(state: State, frequency: Frequency, times: readonly string[]): boolean {
  const current = state.open?.period
  return current !== undefined && sameRhythm(current, { frequency, times })
}

// G23 : l'arrivée d'un report seul, ou la première échéance hors grille, reste la prochaine dose.
function isHeldDay(open: PeriodTimeline, day: string): boolean {
  const move = open.steps.find(({ kind, dose }) => kind === 'move' && dose.nextDueDate === day)
  if (move !== undefined) return shiftOn(open, dueOf(move.dose)) === undefined
  return day === open.period.firstDueOn && isOffGrid(open.period)
}

function lastDueOf(open: PeriodTimeline, day: string): Due {
  return {
    periodId: open.period.id,
    dueOn: day,
    dueTime: [...open.period.times].sort().at(-1) ?? null,
  }
}

// Les journées d'échéance qui suivent ce jour dans le calendrier en vigueur, notées ou non.
function followingDays(open: PeriodTimeline, day: string, count: number): string[] {
  const days: string[] = []
  for (let from = day; days.length < count;) {
    from = nextDueAfter(open, lastDueOf(open, from)).dueOn
    days.push(from)
  }
  return days
}

function periodDays(period: TreatmentPeriodInput, count: number): string[] {
  const plan = planPeriod({ ...period, endsOn: null, stoppedOn: null }, null, [], new Set())
  const perDay = Math.max(1, period.times.length)
  return uniqueSorted(pendingDues(plan, { limit: count * perDay }))
    .map(({ dueOn }) => dueOn)
    .filter((dueOn, index, all) => all.indexOf(dueOn) === index)
    .slice(0, count)
}

// G23 : au même rythme, le jour de référence qui fait suivre à la nouvelle période le calendrier en
// vigueur après sa première dose. Un mensuel repris d'un jour borné (le 28 févr. d'une suite du 31)
// garde au moins la dose suivante, sauf si une ligne plus lointaine la fixe (G5).
function keptReference(open: PeriodTimeline, day: string, fallback: string): string {
  const following = followingDays(open, day, 2)
  const { origin } = sequenceAt(open, positionOf(`${day} `, 0))
  const candidates = [fallback, origin, day, following[0]!]
  const daysWith = (referenceOn: string) =>
    periodDays({ ...open.period, firstDueOn: day, referenceOn }, 3)
  const fits = (count: number) => (referenceOn: string) =>
    daysWith(referenceOn).slice(0, count).join() === [day, ...following].slice(0, count).join()
  const farther = open.steps.some(({ kind, dose }) => kind !== 'note' && dose.nextDueDate > day)
  return candidates.find(fits(3)) ?? (farther ? undefined : candidates.find(fits(2))) ?? fallback
}

// G22 : une journée à venir entamée en avance reste la prochaine, si elle est sur la suite en vigueur.
function scheduledDay(state: State): string | undefined {
  const { open } = state
  const day = state.currentDoses[0]?.dueOn
  if (day === undefined || open === null) return undefined
  if (!open.noteDays.has(day)) return day
  if (day <= state.input.today) return undefined
  if (open.steps.some(({ kind, dose }) => kind === 'shift' && dose.nextDueDate === day)) return day
  const dues = sequenceDues(sequenceAt(open, positionOf(`${day} `, 0)), open.period, day)
  let next = dues.next().value
  while (next.dueOn < day) next = dues.next().value
  return next.dueOn === day ? day : undefined
}

// Au même rythme, la première dose de la nouvelle période et son jour de référence (Q37, G22, G23).
function keptStart(
  state: State,
  open: PeriodTimeline,
  startsOn: string,
  planned: string | undefined,
): Pick<NewPeriod, 'firstDueOn' | 'referenceOn'> | undefined {
  const next = state.currentDoses[0]?.dueOn
  const held = next !== undefined && next >= startsOn && isHeldDay(open, next)
  const day = held ? next : planned
  if (day === undefined || day < startsOn) return undefined
  const fallback =
    day === startsOn && !held ? startsOn : sequenceAt(open, positionOf(`${day} `, 0)).origin
  return { firstDueOn: day, referenceOn: keptReference(open, day, fallback) }
}

// Q24 : la nouvelle période commence aujourd'hui ; ses heures au-delà des prises du jour restent à donner.
export function newPeriod(state: State, frequency: Frequency, times: readonly string[]): NewPeriod {
  checkFrequency(frequency, '')
  if (!times.every(isClockTime) || new Set(times).size !== times.length) {
    throw invalid(`heures ${JSON.stringify(times)}`)
  }
  const { today } = state.input
  const startsOn = latestOf([today, state.plans.at(-1)?.period.startsOn]) ?? today
  const periods = state.plans.map(({ period }) => period)
  const noted = notedOn(startsOn, periods, mergeDoses(state.input.doses))
  const { open } = state
  const dueToday = state.currentDoses.some((due) => due.dueOn === today)
  const fromStart = (noted > 0 && noted < times.length) || (noted === 0 && dueToday)
  const kept = open !== null && keepsSettings(state, frequency, times)
  const scheduled = kept ? scheduledDay(state) : undefined
  if (kept) {
    const start = keptStart(state, open, startsOn, fromStart ? startsOn : scheduled)
    if (start !== undefined) return { startsOn, ...start }
  }
  if (fromStart) return { startsOn, firstDueOn: startsOn, referenceOn: startsOn }
  const proposed = scheduled ?? lastReference(state, frequency) ?? startsOn
  const firstDueOn = proposed > startsOn ? proposed : startsOn
  return { startsOn, firstDueOn, referenceOn: firstDueOn }
}
