import { hoursOf, keyOf, plusDays } from '../grid'
import { isMoreRecent, isTaken } from '../lines'
import { episodeIdsOf } from '../settings'
import type {
  Day,
  Due,
  Gesture,
  GestureResult,
  Line,
  LineChange,
  LineFields,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { shiftOfDay, shiftWritten, written } from './changes'
import { linesAfter, lostToEnd, movedAlone, outcome, shiftDayOf, withFollowed } from './outcome'

export type NoteGesture = Omit<Extract<Gesture, { kind: 'note' }>, 'kind'>

export function checkPast(day: Day, today: Day): void {
  if (day > today) throw new RangeError(`Date réelle dans le futur : ${day}`)
}

const firstDayOf = (input: TreatmentViewInput): Day =>
  input.settings.flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn]).sort()[0] ??
  input.today

/**
 * TR-13 : la dernière échéance tombée à cette date ou avant, encore sans prise ou oubliée ; notée en
 * avance, la prochaine. `time` : l'heure choisie quand il y en a plusieurs.
 */
export function dueForDate(
  input: TreatmentViewInput,
  givenOn: Day,
  time: string | null,
): Due | null {
  checkPast(givenOn, input.today)
  const view = buildView(input)
  const matches = (due: Due) => time === null || due.dueTime === time
  const fallen = view.slots(firstDayOf(input), input.today).filter(({ due }) => matches(due))
  const last = fallen.filter(({ due }) => due.dueOn <= givenOn).at(-1)
  if (last !== undefined && (last.state === 'pending' || last.state === 'missed')) return last.due
  const ahead = fallen.find(({ due, state }) => due.dueOn > givenOn && state === 'pending')
  if (ahead !== undefined) return ahead.due
  return view.upcoming({ from: plusDays(input.today, 1) }).find(matches) ?? null
}

/**
 * R6 : la case est proposée quand la prise change la date de la dose du moment, à la dernière heure de
 * sa journée, et qu'aucune prise ni aucun décalage n'existe plus loin dans le traitement ; jamais pour
 * une dose déplacée seule (Q2 c).
 */
function offersShift(input: TreatmentViewInput, view: TreatmentView, due: Due, givenOn: Day) {
  if (givenOn === due.dueOn || movedAlone(view, input.lines, due.dueOn)) return false
  const key = keyOf(due.dueOn, due.dueTime)
  const sameKey = (other: Due) => keyOf(other.dueOn, other.dueTime) === key
  if (!view.currentDoses.some(sameKey)) return false
  const sameDay = view.slots(due.dueOn, due.dueOn).filter(({ state }) => state === 'pending')
  if (sameDay.some(({ due: other }) => !sameKey(other))) return false
  const own = shiftOfDay(input.lines, shiftDayOf(view, due))
  const later = linesAfter(input, due, new Set(own === undefined ? [] : [own.id]))
  return later.notes.length === 0 && !later.others.some(({ status }) => status === 'shift')
}

// R5 : sans réponse (« Changer la date », anciens exports), la règle d'avant Q27 : en plus à une
// heure, la dose couverte à plusieurs heures.
function isExtra(
  input: TreatmentViewInput,
  view: TreatmentView,
  { due, givenOn, answer }: NoteGesture,
): boolean {
  if (!view.asksExtraOrReplaces(due, givenOn)) return false
  if (answer !== undefined) return answer === 'extra'
  const setting = input.settings.find(({ id }) => id === due.settingId)
  return setting !== undefined && hoursOf(setting.times).length <= 1
}

// TR-25 : la prise la plus récente de la dose dans sa période, de `device` s'il est donné.
function latestOfDose(input: TreatmentViewInput, of: LineFields | Line, device?: string) {
  const period = episodeIdsOf(input.settings, of.settingId)
  return input.lines
    .filter(
      (line) =>
        (device === undefined || line.createdByDevice === device) &&
        isTaken(line) &&
        line.dueOn === of.dueOn &&
        line.dueTime === of.dueTime &&
        period.has(line.settingId),
    )
    .reduce<Line | undefined>(
      (latest, line) => (latest === undefined || isMoreRecent(line, latest) ? line : latest),
      undefined,
    )
}

// TR-25 : la note réécrit la ligne de ce téléphone, sinon la plus récente de la dose ; les autres
// restent, sans effet.
function noteChange(input: TreatmentViewInput, view: TreatmentView, line: LineFields): LineChange {
  const slot = view.slots(line.dueOn, line.dueOn).find(({ due }) => due.dueTime === line.dueTime)
  const exact = slot?.state === 'given' || slot?.state === 'missed' ? (slot.by ?? null) : null
  const of = exact ?? line
  const own = input.device === undefined ? undefined : latestOfDose(input, of, input.device)
  const target = own ?? latestOfDose(input, of) ?? exact
  return target === null ? written(input.lines, line) : { action: 'rewrite', id: target.id, line }
}

/** « C'est fait », « Fait à une autre date », renseigner, « Marquer comme donnée / oubliée ». */
export function noteDose(input: TreatmentViewInput, gesture: NoteGesture): GestureResult {
  const { due, status, givenOn, shiftsFollowing } = gesture
  checkPast(givenOn, input.today)
  const view = buildView(input)
  if (['moved', 'removed'].includes(view.dueState(due)))
    return { refusal: { reason: 'unknown-due' } }
  if (status === 'given' && isExtra(input, view, gesture)) {
    const extra: LineFields = {
      settingId: due.settingId,
      dueOn: givenOn,
      dueTime: due.dueTime,
      status: 'extra',
      givenOn,
      targetOn: null,
    }
    return outcome(input, [written(input.lines, extra)])
  }
  const notes = [
    noteChange(input, view, {
      ...due,
      status,
      givenOn: status === 'given' ? givenOn : null,
      targetOn: null,
    }),
  ]
  const offered = status === 'given' && offersShift(input, view, due, givenOn)
  if (!offered || !shiftsFollowing) return outcome(input, notes, { offersShift: offered })
  const shifted = [
    ...notes,
    shiftWritten(input.lines, { ...due, dueOn: shiftDayOf(view, due) }, givenOn),
  ]
  return withFollowed(input, shifted, due.dueOn, {
    offersShift: true,
    lostToEnd: lostToEnd(input, notes, shifted, due.dueOn),
  })
}
