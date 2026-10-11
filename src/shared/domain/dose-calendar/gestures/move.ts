import { keyOf, later, plusDays, stepped } from '../grid'
import { isNote } from '../lines'
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
import { shiftOfDay, shiftWritten, without, written } from './changes'
import { linesAfter, lostToEnd, outcome } from './outcome'

export type MoveGesture = Omit<Extract<Gesture, { kind: 'move' }>, 'kind'>

/** TR-9 : de `earliest` à `latest` inclus ; `latest` : la date de fin ou, seule, la veille de la dose suivante. */
export type MoveBounds = { earliest: Day; latest: Day | null }

type MovePlan = {
  moved: Due
  existing: Line | undefined
  dayShift: Line | undefined
  bounds: MoveBounds
}

const reportsOf = (view: TreatmentView, episode: ReadonlySet<string>): Line[] =>
  view.history
    .filter(
      ({ line, effect }) =>
        line.status === 'postponed' && effect.kind === 'moves' && episode.has(line.settingId),
    )
    .map(({ line }) => line)

// G6 : le dernier jour d'où la fréquence retombe encore sur l'échéance d'origine.
function oneStepBefore(due: Due, view: TreatmentView): Day {
  const { frequency } = view.settingAt(due.dueOn) ?? view.currentSetting!
  let day = stepped(due.dueOn, frequency, -1)
  while (stepped(plusDays(day, 1), frequency, 1) <= due.dueOn) day = plusDays(day, 1)
  return day
}

// R7, G13, G17 : la dose déplacée, celle que la ligne existante remplace, ou la première heure sans prise de sa journée.
function movedDue(view: TreatmentView, rest: TreatmentView, due: Due, existing?: Line): Due | null {
  const pendingOn = (read: TreatmentView, day: Day) =>
    read
      .slots(day, day)
      .filter(({ state }) => state === 'pending')
      .map((slot) => slot.due)
  if (existing === undefined) {
    const sameDay = pendingOn(view, due.dueOn)
    const known = sameDay.some(
      (other) => keyOf(other.dueOn, other.dueTime) === keyOf(due.dueOn, due.dueTime),
    )
    return known ? sameDay[0]! : null
  }
  if (due.dueOn === existing.dueOn && due.dueOn !== existing.targetOn) {
    return pendingOn(rest, due.dueOn)[0] ?? due
  }
  const own = keyOf(existing.dueOn, existing.dueTime)
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

function planOf(input: TreatmentViewInput, due: Due, shiftsFollowing: boolean): MovePlan | Refusal {
  const view = buildView(input)
  const setting = view.currentSetting
  if (setting === null || view.phase === 'stopped' || view.phase === 'ended') {
    return { reason: 'not-movable' }
  }
  const episode = episodesOf(input.settings).at(-1)!
  const ids = new Set(episode.map(({ id }) => id))
  const notedOn = (day: Day) =>
    input.lines.some((line) => isNote(line) && ids.has(line.settingId) && line.dueOn === day)
  const existing = reportsOf(view, ids)
    .filter(
      (report) =>
        (report.targetOn === due.dueOn && !notedOn(due.dueOn)) || report.dueOn === due.dueOn,
    )
    .at(-1)
  if (existing !== undefined && notedOn(existing.targetOn!)) return { reason: 'arrival-logged' }
  const locked = reportsOf(view, ids).some((report) => report.targetOn === due.dueOn)
  if (existing === undefined && locked && view.dueState(due) !== 'pending') {
    return { reason: 'arrival-logged' }
  }
  const restInput = existing === undefined ? input : without(input, [existing.id])
  const moved = movedDue(view, buildView(restInput), due, existing)
  if (moved === null || moved.dueOn < episode[0]!.startsOn) return { reason: 'not-movable' }
  const dayShift = shiftOfDay(input.lines, existing?.dueOn ?? moved.dueOn)
  const ignored = new Set([existing?.id, dayShift?.id].filter((id) => id !== undefined))
  const after = linesAfter(input, moved, ignored)
  if (after.notes.length > 0) return { reason: 'later-dose' }
  if (after.others.length > 0) return { reason: 'later-line' }
  const rest = buildView(restInput)
  const first = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  const before = [
    oneStepBefore(moved, view),
    ...rest.slots(first, plusDays(moved.dueOn, -1)).map(({ due: other }) => other.dueOn),
    ...input.lines
      .filter(
        (line) =>
          !ignored.has(line.id) &&
          line.status !== 'extra' &&
          line.status !== 'shift' &&
          ids.has(line.settingId),
      )
      .flatMap((line) => [line.dueOn, ...(line.givenOn === null ? [] : [line.givenOn])]),
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
  return { moved, existing, dayShift, bounds: { earliest, latest } }
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

/** R7 : le report de la dose, seul ou avec sa ligne de décalage ancrée au jour d'arrivée (R6). */
export function moveDose(input: TreatmentViewInput, gesture: MoveGesture): GestureResult {
  const { due, to, shiftsFollowing } = gesture
  const plan = planOf(input, due, shiftsFollowing)
  if ('reason' in plan) return { refusal: plan }
  const { moved, existing, dayShift, bounds } = plan
  if (to < bounds.earliest || (bounds.latest !== null && to > bounds.latest)) {
    return { refusal: { reason: 'out-of-bounds', ...bounds } }
  }
  if (existing !== undefined && to === existing.targetOn)
    return outcome(input, [], { offersShift: true })
  const dropShift: LineChange[] =
    dayShift === undefined ? [] : [{ action: 'delete', id: dayShift.id }]
  if (to === moved.dueOn) {
    return outcome(
      input,
      existing === undefined ? [] : [{ action: 'delete', id: existing.id }, ...dropShift],
    )
  }
  const line: LineFields = { ...moved, status: 'postponed', givenOn: null, targetOn: to }
  const report: LineChange =
    existing === undefined
      ? written(input.lines, line)
      : { action: 'rewrite', id: existing.id, line }
  if (!shiftsFollowing) return outcome(input, [report, ...dropShift], { offersShift: true })
  const shift: LineChange =
    dayShift !== undefined && dayShift.dueOn !== moved.dueOn
      ? {
          action: 'rewrite',
          id: dayShift.id,
          line: { ...moved, status: 'shift', givenOn: null, targetOn: to },
        }
      : shiftWritten(input.lines, moved, to)
  const changes = [report, shift]
  return outcome(input, changes, {
    offersShift: true,
    lostToEnd: lostToEnd(input, [report, ...dropShift], changes, moved.dueOn),
  })
}
