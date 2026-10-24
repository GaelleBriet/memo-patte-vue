import type { Due, Gesture, GestureResult, Line, LineChange, TreatmentViewInput } from '../types'
import { episodeIdsOf } from '../settings'
import { buildView } from '../view'
import { shiftOfDay, shiftWritten, without } from './changes'
import { doseLines } from './dose-lines'
import { checkPast, dueForDate, noteDose } from './note'
import { linesAfter, lostToEnd, movedAlone, outcome, shiftDayOf, withFollowed } from './outcome'

export type RedateGesture = Omit<Extract<Gesture, { kind: 'redate' }>, 'kind'>

// TR-24, R5 : une prise en plus redatée reste en plus tant que la question se poserait ; sinon elle
// vise ce que viserait une prise notée ce jour-là.
function redateExtra(
  input: TreatmentViewInput,
  extra: Line,
  gesture: RedateGesture,
): GestureResult {
  const { givenOn } = gesture
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
    line: {
      settingId: extra.settingId,
      dueOn: givenOn,
      dueTime: extra.dueTime,
      status: 'extra',
      givenOn,
      targetOn: null,
    },
  }
  if (due === null) return outcome(input, [moved])
  const plain = noteDose(rest, {
    due,
    status: 'given',
    givenOn,
    shiftsFollowing: false,
    answer: 'extra',
  })
  if ('refusal' in plain) return plain
  const stillExtra = plain.changes.some(
    (change) => change.action !== 'delete' && change.line.status === 'extra',
  )
  if (stillExtra) return outcome(input, [moved])
  return redateAsNote(input, rest, extra, due, gesture)
}

function redateAsNote(
  input: TreatmentViewInput,
  rest: TreatmentViewInput,
  line: Line,
  target: Due,
  gesture: RedateGesture,
): GestureResult {
  const { givenOn, shiftsFollowing } = gesture
  // R6, R11 : la correction ne fait jamais d'un oubli plus lointain une prise donnée.
  if (buildView(rest).dueState(target) === 'missed') return { refusal: { reason: 'later-dose' } }
  const plain = noteDose(rest, { due: target, status: 'given', givenOn, shiftsFollowing: false })
  if ('refusal' in plain) return plain
  const missed = plain.changes.find((change) => change.action === 'rewrite')
  const prise: LineChange[] =
    missed === undefined
      ? [
          {
            action: 'rewrite',
            id: line.id,
            line: { ...target, status: 'given', givenOn, targetOn: null },
          },
        ]
      : [{ action: 'delete', id: line.id }, missed]
  if (!plain.offersShift || !shiftsFollowing) {
    return withFollowed(input, prise, target.dueOn, {
      offersShift: plain.offersShift,
      lostToEnd: [],
    })
  }
  const shiftDay = shiftDayOf(buildView(rest), target)
  const changes = [...prise, shiftWritten(rest.lines, { ...target, dueOn: shiftDay }, givenOn)]
  return withFollowed(input, changes, target.dueOn, {
    offersShift: true,
    lostToEnd: lostToEnd(input, prise, changes, target.dueOn),
  })
}

function redateGiven(input: TreatmentViewInput, line: Line, gesture: RedateGesture): GestureResult {
  const { givenOn, shiftsFollowing } = gesture
  const view = buildView(input)
  const due = { settingId: line.settingId, dueOn: line.dueOn, dueTime: line.dueTime }
  const shiftDay = shiftDayOf(view, due)
  const own = shiftOfDay(input.lines, shiftDay)
  if (givenOn === line.givenOn) return outcome(input, [], { offersShift: own !== undefined })
  const boundary = view.earliestGivenOn(due)
  if (boundary !== null && givenOn < boundary) {
    return { refusal: { reason: 'too-early', earliest: boundary } }
  }
  const ignored = new Set([line.id, ...(own === undefined ? [] : [own.id])])
  const later = linesAfter(input, line, ignored)
  const blocked = later.notes.length > 0 || later.others.some(({ status }) => status === 'shift')
  const dayDone = view
    .slots(line.dueOn, line.dueOn)
    .every(({ due: other, state }) => state !== 'pending' || other.dueTime === line.dueTime)
  const closed =
    view.phase === 'stopped' ||
    !episodeIdsOf(input.settings, line.settingId).has(view.currentSetting?.id ?? '')
  const alone = movedAlone(view, input.lines, line.dueOn)
  const offered = givenOn !== line.dueOn && !blocked && dayDone && !closed && !alone
  const prise: LineChange = {
    action: 'rewrite',
    id: line.id,
    line: { ...due, status: 'given', givenOn, targetOn: null },
  }
  // G18 : le décalage d'une dose avancée est celui de son report, ancré à son jour d'arrivée.
  const reportAnchor = shiftDay === line.dueOn ? null : line.dueOn
  // N2 : seul le décalage ancré à la date de la prise la suit ; un autre décalage de la journée reste.
  const owned = own !== undefined && own.targetOn === line.givenOn ? own : undefined
  const changesFor = (checked: boolean): LineChange[] => {
    if (offered && checked)
      return [prise, shiftWritten(input.lines, { ...due, dueOn: shiftDay }, givenOn)]
    const drops = owned !== undefined && (offered || givenOn === line.dueOn)
    if (!drops) return [prise]
    if (reportAnchor === null) return [prise, { action: 'delete', id: owned.id }]
    return [prise, shiftWritten(input.lines, owned, reportAnchor)]
  }
  const changes = changesFor(shiftsFollowing)
  return withFollowed(input, changes, line.dueOn, {
    offersShift: offered,
    lostToEnd:
      offered && shiftsFollowing ? lostToEnd(input, changesFor(false), changes, line.dueOn) : [],
  })
}

/**
 * TR-24 bis : la correction change la date réelle d'une prise donnée, jamais son échéance (Q30) ; la
 * case se juge à la nouvelle date ; un report seul qui ne tient plus suit (G19), sinon la correction
 * est refusée. TR-25 : les autres lignes de la dose (deux appareils) partent avec la correction.
 */
export function redateDose(input: TreatmentViewInput, gesture: RedateGesture): GestureResult {
  const { lineId } = gesture
  checkPast(gesture.givenOn, input.today)
  const line = input.lines.find(({ id }) => id === lineId)
  if (line?.status === 'extra') return redateExtra(input, line, gesture)
  if (line?.status !== 'given') throw new RangeError(`Aucune prise donnée à redater : ${lineId}`)
  const others = doseLines(input, line).map(({ id }) => id)
  const result = redateGiven(without(input, others), line, gesture)
  if ('refusal' in result || result.changes.length === 0) return result
  const dropped = others.map((id): LineChange => ({ action: 'delete', id }))
  return { ...result, changes: [...result.changes, ...dropped] }
}
