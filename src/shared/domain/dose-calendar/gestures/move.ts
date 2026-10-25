import { keyOf, later, plusDays, stepped } from '../grid'
import { isTaken } from '../lines'
import { episodesOf } from '../settings'
import type {
  Day,
  Due,
  Gesture,
  GestureResult,
  Line,
  LineChange,
  LineFields,
  Refusal,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied, shiftOfDay, shiftWritten, without, written } from './changes'
import { linesAfter, livesOn, lostToEnd, outcome } from './outcome'
import {
  arrivalOnGridDay,
  chosenArrivalKept,
  followerLines,
  opensRhythm,
  reportsOf,
  reportToRewrite,
  sharedArrival,
} from './moved-report'
import { strandsNote } from './reports'

export type MoveGesture = Omit<Extract<Gesture, { kind: 'move' }>, 'kind'>

/**
 * TR-9 : de `earliest` à `latest` inclus ; `latest` : la date de fin ou, seule, la veille de la dose
 * suivante ; `excluded` : les jours d'origine d'un autre report, où la dose n'arrive pas (R7, G9).
 */
export type MoveBounds = { earliest: Day; latest: Day | null; excluded: Day[] }

type MovePlan = {
  moved: Due
  existing: Line | undefined
  /** R7, #1274 : le report arrivé sur la journée qui part, réécrit vers la même arrivée. */
  follower: Line | undefined
  dayShift: Line | undefined
  bounds: MoveBounds
}

// G6 : le dernier jour d'où la fréquence retombe encore sur l'échéance d'origine.
function oneStepBefore(due: Due, view: TreatmentView): Day {
  const { frequency } = view.settingAt(due.dueOn) ?? view.currentSetting!
  let day = stepped(due.dueOn, frequency, -1)
  while (stepped(plusDays(day, 1), frequency, 1) <= due.dueOn) day = plusDays(day, 1)
  return day
}

// R7, G13, G17 : la dose déplacée ; un report garde son échéance tant qu'il la déplace, sinon il vise celle qu'il remplace.
function movedDue(view: TreatmentView, rest: TreatmentView, due: Due, existing?: Line): Due | null {
  const pendingOn = (read: TreatmentView, day: Day) =>
    read
      .slots(day, day)
      .filter(({ state }) => state === 'pending')
      .map((slot) => slot.due)
  // R7 : la dose touchée part, avec les heures suivantes encore sans prise de sa journée.
  if (existing === undefined) {
    const touched = keyOf(due.dueOn, due.dueTime)
    return (
      pendingOn(view, due.dueOn).find((other) => keyOf(other.dueOn, other.dueTime) === touched) ??
      null
    )
  }
  if (due.dueOn === existing.dueOn && due.dueOn !== existing.targetOn) {
    return pendingOn(rest, due.dueOn)[0] ?? due
  }
  const own = keyOf(existing.dueOn, existing.dueTime)
  const effect = view.history.find(({ line }) => line.id === existing.id)?.effect
  if (effect?.kind === 'moves' && effect.keys.includes(own)) {
    return { settingId: existing.settingId, dueOn: existing.dueOn, dueTime: existing.dueTime }
  }
  const replaced = rest
    .slots(existing.dueOn, plusDays(existing.dueOn, 400))
    .find(
      ({ due: other, state }) => state === 'pending' && keyOf(other.dueOn, other.dueTime) >= own,
    )
  return (
    replaced?.due ?? {
      settingId: existing.settingId,
      dueOn: existing.dueOn,
      dueTime: existing.dueTime,
    }
  )
}

// G13, R6 : réécrit vers l'échéance qu'il remplace, le report laisserait une prise sans échéance.
function rewriteStrands(
  input: TreatmentViewInput,
  view: TreatmentView,
  existing: Line,
  moved: Due,
): boolean {
  if (keyOf(moved.dueOn, moved.dueTime) === keyOf(existing.dueOn, existing.dueTime)) return false
  const line: LineFields = {
    ...moved,
    status: 'postponed',
    givenOn: null,
    targetOn: existing.targetOn,
  }
  return strandsNote(
    view,
    buildView(applied(input, [{ action: 'rewrite', id: existing.id, line }])),
  )
}

function planOf(
  input: TreatmentViewInput,
  due: Due,
  shiftsFollowing: boolean,
  carried = false,
): MovePlan | Refusal {
  const view = buildView(input)
  const setting = view.currentSetting
  if (setting === null || view.phase === 'stopped' || view.phase === 'ended') {
    return { reason: 'not-movable' }
  }
  const episode = episodesOf(input.settings).at(-1)!
  const ids = new Set(episode.map(({ id }) => id))
  const notedOn = (day: Day) =>
    input.lines.some((line) => isTaken(line) && ids.has(line.settingId) && line.dueOn === day)
  const found = reportToRewrite(input, view, ids, due, notedOn, carried)
  const arrival = found === undefined || carried ? null : arrivalOnGridDay(input, view, found, due)
  if (arrival !== null && 'refusal' in arrival) return arrival.refusal
  const follower = arrival?.follower
  const existing = follower === undefined ? found : undefined
  if (existing !== undefined && notedOn(existing.targetOn!)) return { reason: 'arrival-logged' }
  // R7, R9.2 : partie de son arrivée, la dose rendrait au jour les heures du nouveau rythme.
  if (existing !== undefined && opensRhythm(view, existing)) return { reason: 'not-movable' }
  const shared = existing === undefined || carried ? undefined : sharedArrival(view, existing)
  if (shared !== undefined) return { reason: 'arrival-shared', on: shared.dueOn }
  const locked = reportsOf(view, ids).some((report) => report.targetOn === due.dueOn)
  if (existing === undefined && locked && view.dueState(due) !== 'pending') {
    return { reason: 'arrival-logged' }
  }
  const restInput = existing === undefined ? input : without(input, [existing.id])
  const moved = movedDue(view, buildView(restInput), due, existing)
  if (moved === null || moved.dueOn < episode[0]!.startsOn) return { reason: 'not-movable' }
  if (existing !== undefined && rewriteStrands(input, view, existing, moved)) {
    return { reason: 'later-dose' }
  }
  const dayShift = shiftOfDay(input.lines, existing?.dueOn ?? moved.dueOn)
  const ignored = new Set(
    [existing?.id, follower?.id, dayShift?.id].filter((id) => id !== undefined),
  )
  const livesAt = [moved.dueOn, existing?.targetOn ?? moved.dueOn].sort()[0]!
  // R6 : un décalage déplacerait la grille sous l'échéance d'origine d'une dose avancée plus loin.
  const dayOf = shiftsFollowing ? undefined : livesOn
  const after = linesAfter(input, { ...moved, dueOn: livesAt }, ignored, dayOf)
  if (after.notes.length > 0) return { reason: 'later-dose' }
  if (after.others.length > 0) return { reason: 'later-line' }
  const rest = buildView(restInput)
  const first = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  const before = [
    oneStepBefore(moved, view),
    ...rest.slots(first, plusDays(livesAt, -1)).map(({ due: other }) => other.dueOn),
    ...input.lines
      .filter(
        (line) =>
          !ignored.has(line.id) &&
          line.status !== 'extra' &&
          line.status !== 'shift' &&
          ids.has(line.settingId),
      )
      .flatMap((line) => [livesOn(line), ...(line.givenOn === null ? [] : [line.givenOn])]),
  ].sort()
  const earliest = [input.today, setting.startsOn, plusDays(before.at(-1)!, 1)].sort().at(-1)!
  let latest = setting.endsOn
  if (latest !== null && earliest > latest) return { reason: 'no-date-left' }
  if (!shiftsFollowing) {
    const alone = buildView(without(restInput, dayShift === undefined ? [] : [dayShift.id]))
    const nextOn = alone
      .slots(plusDays(moved.dueOn, 1), plusDays(later(moved.dueOn, earliest), 800))
      .find(({ state }) => state === 'pending')?.due.dueOn
    if (nextOn !== undefined) {
      const cap = latest !== null && latest < plusDays(nextOn, -1) ? latest : plusDays(nextOn, -1)
      if (cap < earliest || (earliest === cap && cap === moved.dueOn)) {
        return { reason: 'no-date-alone' }
      }
      latest = cap
    }
  }
  const excluded = reportsOf(view, ids)
    .filter(({ id, dueOn }) => !ignored.has(id) && dueOn !== moved.dueOn)
    .map(({ dueOn }) => dueOn)
    .filter((day) => day >= earliest && (latest === null || day <= latest))
  const bounds = { earliest, latest, excluded: [...new Set(excluded)].sort() }
  return { moved, existing, follower, dayShift, bounds }
}

/** « Prochaine dose » : bornes du déplacement (TR-9, G6, G8, Q20, Q2 a), ou pourquoi il est refusé (G7, Q25). */
export function moveBounds(
  input: TreatmentViewInput,
  due: Due,
  shiftsFollowing: boolean,
): MoveBounds | { refusal: Refusal } {
  const plan = planOf(input, due, shiftsFollowing)
  return 'reason' in plan ? { refusal: plan } : plan.bounds
}

function boundsRefusal(bounds: MoveBounds, to: Day): Refusal | null {
  const { earliest, latest, excluded } = bounds
  if (to < earliest || (latest !== null && to > latest)) {
    return { reason: 'out-of-bounds', earliest, latest }
  }
  return excluded.includes(to) ? { reason: 'report-loop' } : null
}

// R7, R6 : ramené à son jour, le report part avec le décalage de sa journée ; réécrit, il garde ce
// décalage, ancré au jour d'arrivée, seulement quand les doses suivantes le suivent.
function reportLines(
  input: TreatmentViewInput,
  { moved, existing, follower, dayShift }: MovePlan,
  to: Day,
  shiftsFollowing: boolean,
  due: Due,
): LineChange[] {
  const dropShift: LineChange[] =
    dayShift === undefined ? [] : [{ action: 'delete', id: dayShift.id }]
  if (to === moved.dueOn) {
    return existing === undefined ? [] : [{ action: 'delete', id: existing.id }, ...dropShift]
  }
  const line: LineFields = { ...moved, status: 'postponed', givenOn: null, targetOn: to }
  // Q-a : repris sur son arrivée, le report garde l'heure de la dose qu'on y a touchée.
  const touched =
    existing !== undefined && due.dueOn === existing.targetOn ? due.dueTime : undefined
  const kept =
    existing === undefined || !shiftsFollowing
      ? undefined
      : chosenArrivalKept(input.settings, existing, dayShift, to)
  const report: LineChange =
    existing === undefined
      ? written(input.lines, line)
      : {
          action: 'rewrite',
          id: existing.id,
          line:
            kept !== undefined
              ? { ...line, ...kept }
              : touched === undefined
                ? line
                : { ...line, previousTargetTime: touched },
        }
  const follows = followerLines(follower, to)
  if (!shiftsFollowing) return [report, ...follows, ...dropShift]
  // R6, R7 : le décalage appartient au rythme en vigueur ce jour-là, sinon il serait dépassé.
  const inForce = buildView(input).settingAt(moved.dueOn)?.id ?? moved.settingId
  const at = { ...moved, settingId: inForce }
  const shift: LineChange =
    dayShift !== undefined && dayShift.dueOn !== moved.dueOn
      ? {
          action: 'rewrite',
          id: dayShift.id,
          line: { ...at, status: 'shift', givenOn: null, targetOn: to },
        }
      : shiftWritten(input.lines, at, to)
  return [report, ...follows, shift]
}

/** R7 : le report de la dose, seul ou avec sa ligne de décalage ancrée au jour d'arrivée (R6). */
export function moveDose(input: TreatmentViewInput, gesture: MoveGesture): GestureResult {
  const { due, to, shiftsFollowing } = gesture
  const plan = planOf(input, due, shiftsFollowing)
  if ('reason' in plan) return { refusal: plan }
  const refusal = boundsRefusal(plan.bounds, to)
  if (refusal !== null) return { refusal }
  const { moved, existing } = plan
  if (existing !== undefined && to === existing.targetOn)
    return outcome(input, [], { offersShift: true })
  const changes = reportLines(input, plan, to, shiftsFollowing, due)
  if (to === moved.dueOn) return outcome(input, changes)
  if (!shiftsFollowing) return outcome(input, changes, { offersShift: true })
  const alone = reportLines(input, plan, to, false, due)
  return outcome(input, changes, {
    offersShift: true,
    lostToEnd: lostToEnd(input, alone, changes, moved.dueOn),
  })
}

/**
 * #796 : le report qui arrive à la dose, emmené à la date choisie comme par « Prochaine dose » avec
 * le décalage de sa journée, sans en écrire un ; rien sans report ou hors des bornes (G7, G8).
 */
export function arrivalFollowing(input: TreatmentViewInput, due: Due, to: Day): LineChange[] {
  const plan = planOf(input, due, true, true)
  if ('reason' in plan || plan.existing === undefined) return []
  if (boundsRefusal(plan.bounds, to) !== null) return []
  return reportLines(input, plan, to, plan.dayShift !== undefined, due)
}
