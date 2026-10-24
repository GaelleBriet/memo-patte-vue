import {
  redateAsksExtraOrReplaces,
  treatmentView,
  type Due,
  type Gesture,
  type Line,
  type TreatmentView,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { int, pick, plusDays, type Random } from './carnet'
import { firstDayOf } from './v2-reading'
import type { V2Walk } from './v2-walk'

/** Une note ; « Cette prise » (R5, Q27) tirée à part quand la question se pose. */
export function noteGesture(
  walk: V2Walk,
  due: Due,
  status: 'given' | 'missed',
  givenOn: string,
  random: Random = walk.random,
): Gesture {
  const shiftsFollowing = random() < 0.65
  const asked =
    walk.answers !== null &&
    status === 'given' &&
    treatmentView(walk.input).asksExtraOrReplaces(due, givenOn)
  if (!asked) return { kind: 'note', due, status, givenOn, shiftsFollowing }
  const answer = walk.answers!() < 0.5 ? 'extra' : 'replaces'
  return { kind: 'note', due, status, givenOn, shiftsFollowing, answer }
}

/** « Changer la date » ; d'une prise en plus qui couvrirait une dose, la réponse tirée (Q37). */
export function redateWithAnswer(
  walk: V2Walk,
  line: Line,
  givenOn: string,
): Extract<Gesture, { kind: 'redate' }> {
  const gesture: Extract<Gesture, { kind: 'redate' }> = {
    kind: 'redate',
    lineId: line.id,
    givenOn,
    shiftsFollowing: walk.random() < 0.65,
  }
  if (!walk.redateAnswers || walk.answers === null) return gesture
  if (redateAsksExtraOrReplaces(walk.input, line.id, givenOn) === null) return gesture
  return { ...gesture, answer: walk.answers() < 0.5 ? 'extra' : 'replaces' }
}

function previousDueDay(input: TreatmentViewInput, view: TreatmentView, dueOn: string) {
  const firstDay = firstDayOf(input)
  if (firstDay >= dueOn) return undefined
  return view.slots(firstDay, plusDays(dueOn, -1)).at(-1)?.due.dueOn
}

/**
 * La carte de la fiche (TR-13, Q28) : sa dose, ou l'une des heures encore à donner de sa journée, donnée un jour du
 * lendemain de l'échéance précédente à aujourd'hui ; sans échéance précédente, une semaine au plus.
 */
export function cardOtherDate(walk: V2Walk): Gesture | null {
  const random = walk.card
  if (random === null) return null
  const { input } = walk
  const { today } = input
  const view = treatmentView(input)
  const [first] = view.currentDoses
  if (first === undefined) return null
  const day =
    view.currentDoses.length > 1
      ? view
          .slots(first.dueOn, first.dueOn)
          .filter(({ state }) => state === 'pending')
          .map(({ due: other }) => other)
      : []
  const due = pick(random, day.length > 0 ? day : [first])!
  const previous = previousDueDay(input, view, first.dueOn)
  const after = previous === undefined ? plusDays(today, -7) : plusDays(previous, 1)
  const earliest = after > today ? today : after
  const span = Math.round((Date.parse(today) - Date.parse(earliest)) / 864e5)
  return noteGesture(walk, due, 'given', plusDays(earliest, int(random, 0, span)), random)
}
