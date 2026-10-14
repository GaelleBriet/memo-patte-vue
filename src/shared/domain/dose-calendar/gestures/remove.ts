import { isNote } from '../lines'
import type { GestureResult, Line, LineChange, Refusal, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { shiftOfDay, without } from './changes'
import { doseLines } from './dose-lines'
import { outcome } from './outcome'
import { brokenReports } from './reports'

// N8 : la prise de la dose déplacée par le report de la même journée n'est pas une dose plus lointaine.
function shiftRemovalRefusal(input: TreatmentViewInput, shift: Line): Refusal | null {
  const view = buildView(input)
  const arrival = view.history.find(
    ({ line, effect }) =>
      line.status === 'postponed' && effect.kind === 'moves' && line.dueOn === shift.dueOn,
  )?.line.targetOn
  const later = input.lines.some(
    (line) => isNote(line) && line.dueOn > shift.dueOn && line.dueOn !== arrival,
  )
  if (later) return { reason: 'later-dose' }
  const rest = without(input, [shift.id])
  const [broken] = brokenReports(input, rest, shift.dueOn)
  if (broken === undefined) return null
  const inRhythm = buildView(without(rest, [broken.id])).dueState(broken) === 'pending'
  return { reason: inRhythm ? 'report-past-next' : 'report-off-rhythm', on: broken.targetOn! }
}

/**
 * Pourquoi « Supprimer » est refusé : report dont la dose d'arrivée est notée (Q25) ou devenue la
 * première échéance d'un nouveau rythme (#780, R9.2), décalage suivi
 * d'une prise ou d'un report seul qui ne tiendrait plus (N8, G19) ; une ligne sans effet se supprime
 * toujours (R11).
 */
export function removalRefusal(input: TreatmentViewInput, lineId: string): Refusal | null {
  const line = input.lines.find(({ id }) => id === lineId)
  if (line === undefined) throw new RangeError(`Aucune ligne à supprimer : ${lineId}`)
  const effect = buildView(input).history.find((entry) => entry.line.id === lineId)!.effect
  if (effect.kind === 'idle') return null
  if (line.status === 'postponed') {
    const logged = input.lines.some((other) => isNote(other) && other.dueOn === line.targetOn)
    if (logged) return { reason: 'arrival-logged' }
    return effect.kind === 'moves' && effect.opensRhythm ? { reason: 'not-movable' } : null
  }
  return line.status === 'shift' ? shiftRemovalRefusal(input, line) : null
}

/**
 * #835 : le décalage ancré à l'arrivée d'un report part avec lui, comme « Prochaine dose » ramenée au
 * jour d'origine ; gardé quand il ne pourrait pas être supprimé seul (N8, G19).
 */
function anchoredShift(input: TreatmentViewInput, report: Line): Line[] {
  if (report.status !== 'postponed') return []
  const effect = buildView(input).history.find(({ line }) => line.id === report.id)!.effect
  const shift = shiftOfDay(input.lines, report.dueOn)
  if (effect.kind !== 'moves' || shift === undefined || shift.targetOn !== report.targetOn)
    return []
  return shiftRemovalRefusal(without(input, [report.id]), shift) === null ? [shift] : []
}

/** R11 : seule la personne supprime une ligne ; le décalage d'une prise reste (N6, N8). */
export function removeLine(input: TreatmentViewInput, lineId: string): GestureResult {
  const refusal = removalRefusal(input, lineId)
  if (refusal !== null) return { refusal }
  const removed = input.lines.find(({ id }) => id === lineId)!
  const ids = [
    lineId,
    ...[...doseLines(input, removed), ...anchoredShift(input, removed)].map(({ id }) => id),
  ]
  return outcome(
    input,
    ids.map((id): LineChange => ({ action: 'delete', id })),
  )
}
