import { isNote } from '../lines'
import { episodeIdsOf } from '../settings'
import type { GestureResult, Line, LineChange, Refusal, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { without } from './changes'
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

// TR-25 : la prise en vigueur emporte les autres lignes de sa dose dans sa période (deux appareils) ;
// une ligne sans effet, ou une prise d'une autre période (#822), part seule.
function doseLines(input: TreatmentViewInput, removed: Line): Line[] {
  const effect = buildView(input).history.find(({ line }) => line.id === removed.id)!.effect
  if (!isNote(removed) || effect.kind === 'idle') return []
  const period = episodeIdsOf(input.settings, removed.settingId)
  return input.lines.filter(
    (line) =>
      line.id !== removed.id &&
      isNote(line) &&
      period.has(line.settingId) &&
      line.dueOn === removed.dueOn &&
      line.dueTime === removed.dueTime,
  )
}

/** R11 : seule la personne supprime une ligne ; le décalage d'une prise ou d'un report reste (N6, N8). */
export function removeLine(input: TreatmentViewInput, lineId: string): GestureResult {
  const refusal = removalRefusal(input, lineId)
  if (refusal !== null) return { refusal }
  const removed = input.lines.find(({ id }) => id === lineId)!
  const ids = [lineId, ...doseLines(input, removed).map(({ id }) => id)]
  return outcome(
    input,
    ids.map((id): LineChange => ({ action: 'delete', id })),
  )
}
