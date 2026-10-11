import { keyOf } from '../grid'
import type {
  FollowedReport,
  Gesture,
  GestureResult,
  Line,
  LineChange,
  TreatmentViewInput,
} from '../types'
import { buildView } from '../view'
import { applied, shiftOfDay, shiftWritten, without } from './changes'
import { checkPast, dueForDate, noteDose } from './note'
import { linesAfter, lostToEnd, outcome, shiftDayOf } from './outcome'
import { brokenReports, followed } from './reports'

export type RedateGesture = Omit<Extract<Gesture, { kind: 'redate' }>, 'kind'>

// TR-24 : changer la date d'une prise en plus la fait viser ce que viserait une prise notée ce jour-là.
function redateExtra(
  input: TreatmentViewInput,
  extra: Line,
  gesture: RedateGesture,
): GestureResult {
  const { givenOn, shiftsFollowing } = gesture
  if (givenOn === extra.givenOn) return outcome(input, [])
  const taken = input.lines.some(
    (line) =>
      line.id !== extra.id &&
      line.status === 'extra' &&
      line.settingId === extra.settingId &&
      line.dueOn === givenOn,
  )
  if (taken) return { refusal: { reason: 'day-taken' } }
  const rest = without(input, [extra.id])
  const due = dueForDate(rest, givenOn, null)
  const moved: LineChange = {
    action: 'rewrite',
    id: extra.id,
    line: { ...extra, dueOn: givenOn, givenOn },
  }
  if (due === null) return outcome(input, [moved])
  const noted = noteDose(rest, { due, status: 'given', givenOn, shiftsFollowing })
  if ('refusal' in noted) return noted
  const stillExtra = noted.changes.some(
    (change) => change.action !== 'delete' && change.line.status === 'extra',
  )
  if (stillExtra) return outcome(input, [moved])
  return outcome(input, [{ action: 'delete', id: extra.id }, ...noted.changes], {
    offersShift: noted.offersShift,
    lostToEnd: noted.lostToEnd,
  })
}

/**
 * TR-24 bis, Q-C1 : la correction se juge au jour de la nouvelle date, comme une prise notée ce
 * jour-là ; un report seul qui ne tient plus suit (G19), sinon la correction est refusée.
 */
export function redateDose(input: TreatmentViewInput, gesture: RedateGesture): GestureResult {
  const { lineId, givenOn, shiftsFollowing } = gesture
  checkPast(givenOn, input.today)
  const line = input.lines.find(({ id }) => id === lineId)
  if (line?.status === 'extra') return redateExtra(input, line, gesture)
  if (line?.status !== 'given') throw new RangeError(`Aucune prise donnée à redater : ${lineId}`)
  const view = buildView(input)
  const due = { settingId: line.settingId, dueOn: line.dueOn, dueTime: line.dueTime }
  const shiftDay = shiftDayOf(view, due)
  const own = shiftOfDay(input.lines, shiftDay)
  if (givenOn === line.givenOn) return outcome(input, [], { offersShift: own !== undefined })
  const boundary = view.extraBoundary(due)
  if (boundary !== null && givenOn < boundary) {
    return { refusal: { reason: 'too-early', earliest: boundary } }
  }
  const sisters = input.lines.filter(
    (other) =>
      other.status === line.status &&
      keyOf(other.dueOn, other.dueTime) === keyOf(line.dueOn, line.dueTime),
  )
  const ignored = new Set([...sisters.map(({ id }) => id), ...(own === undefined ? [] : [own.id])])
  const later = linesAfter(input.lines, line.dueOn, ignored)
  const blocked = later.notes.length > 0 || later.others.some(({ status }) => status === 'shift')
  const dayDone = view
    .slots(line.dueOn, line.dueOn)
    .every(({ due: other, state }) => state !== 'pending' || other.dueTime === line.dueTime)
  const offered = givenOn !== line.dueOn && !blocked && dayDone
  const prise: LineChange = {
    action: 'rewrite',
    id: line.id,
    line: { ...due, status: 'given', givenOn, targetOn: null },
  }
  const changesFor = (checked: boolean): LineChange[] => {
    if (offered && checked)
      return [prise, shiftWritten(input.lines, { ...due, dueOn: shiftDay }, givenOn)]
    const drops = own !== undefined && (offered || (givenOn === line.dueOn && !blocked))
    return drops ? [prise, { action: 'delete', id: own.id }] : [prise]
  }
  const brokenWith = (changes: LineChange[]) =>
    brokenReports(input, applied(input, changes), line.dueOn)
  let changes = changesFor(shiftsFollowing)
  const broken = brokenWith(changes)
  const extra = {
    offersShift: offered,
    lostToEnd:
      offered && shiftsFollowing ? lostToEnd(input, changesFor(false), changes, line.dueOn) : [],
  }
  if (broken.length === 0) return outcome(input, changes, extra)
  if (offered && brokenWith(changesFor(!shiftsFollowing)).length === 0) {
    return { refusal: { reason: 'passes-report', on: broken[0]!.targetOn! } }
  }
  const follows: FollowedReport[] = []
  for (const report of broken) {
    const carnet = applied(input, changes)
    const next = followed(
      carnet,
      carnet.lines.find(({ id }) => id === report.id)!,
      line.dueOn,
    )
    if (next === null) return { refusal: { reason: 'stuck-report', on: report.targetOn! } }
    changes = [...changes, next.change]
    follows.push({ from: report.targetOn!, to: next.to })
  }
  if (brokenWith(changes).length > 0) {
    return { refusal: { reason: 'stuck-report', on: broken[0]!.targetOn! } }
  }
  return outcome(input, changes, { ...extra, followed: follows })
}
