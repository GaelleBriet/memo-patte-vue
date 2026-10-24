import { treatmentView, type Line, type TreatmentViewInput } from '@/shared/domain/dose-calendar'

import { dueKey } from './display'
import { compare, firstDayOf, horizonOf, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

const sameLine = (a: Line, b: Line) => JSON.stringify(a) === JSON.stringify(b)

function calendar(input: TreatmentViewInput): string[] {
  return treatmentView(input)
    .slots(firstDayOf(input), horizonOf(input))
    .map(({ due, state }) => `${dueKey(due)} ${state}`)
}

// Une prise en plus ne cesse de l'être que par « Changer la date » répondu « Remplace », ou sans réponse (règle d'avant Q27).
function lostExtra({ before, after, gesture }: V2Step): Broken | null {
  const redated = gesture?.kind === 'redate' && gesture.answer !== 'extra' ? gesture.lineId : null
  for (const extra of before.lines) {
    if (extra.status !== 'extra' || extra.id === redated) continue
    const now = after.lines.find(({ id }) => id === extra.id)
    if (now !== undefined && now.status !== 'extra') {
      return {
        invariant: 'en plus',
        detail: `prise en plus ${JSON.stringify(extra)} devenue ${JSON.stringify(now)}`,
      }
    }
  }
  return null
}

/**
 * R5, Q27, Q37 : une réponse « En plus » écrit une prise en plus à sa date, et rien d'autre (aucune
 * dose couverte, calendrier inchangé) ; une prise en plus le reste aux pas suivants.
 */
export function staysExtra(step: V2Step): Broken | null {
  const lost = lostExtra(step)
  if (lost !== null) return lost
  const { before, after, gesture } = step
  if (gesture?.kind !== 'note' && gesture?.kind !== 'redate') return null
  if (gesture.answer !== 'extra') return null
  if (
    gesture.kind === 'note' &&
    !treatmentView(before).asksExtraOrReplaces(gesture.due, gesture.givenOn)
  )
    return null
  const written = after.lines.filter((line) => !before.lines.some((other) => sameLine(line, other)))
  const removed = before.lines.filter(({ id }) => !after.lines.some((other) => other.id === id))
  const wasExtra = (id: string) => {
    const previous = before.lines.find((other) => other.id === id)
    return previous === undefined ? gesture.kind === 'note' : previous.status === 'extra'
  }
  const expected = written.every(
    ({ id, status, dueOn, givenOn }) =>
      status === 'extra' &&
      dueOn === gesture.givenOn &&
      givenOn === gesture.givenOn &&
      wasExtra(id) &&
      (gesture.kind === 'note' || id === gesture.lineId),
  )
  const label = `en plus (${gesture.kind} le ${gesture.givenOn})`
  if (!expected || removed.length > 0 || written.length > 1) {
    const detail = `${label} : écrites ${JSON.stringify(written)}, supprimées ${JSON.stringify(removed)}`
    return { invariant: 'en plus', detail }
  }
  const broken = compare(label, calendar(before), calendar(after))
  return broken === null ? null : { ...broken, invariant: 'en plus' }
}
