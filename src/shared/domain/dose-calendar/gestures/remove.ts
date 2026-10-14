import { isNote } from '../lines'
import type { GestureResult, Line, LineChange, Refusal, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { without } from './changes'
import { doseLines, shiftsOfDay } from './dose-lines'
import { linesAfter, livesOn, outcome } from './outcome'
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
  const rest = without(
    input,
    shiftsOfDay(input, shift).map(({ id }) => id),
  )
  const [broken] = brokenReports(input, rest, shift.dueOn)
  if (broken === undefined) return null
  const inRhythm = buildView(without(rest, [broken.id])).dueState(broken) === 'pending'
  return { reason: inRhythm ? 'report-past-next' : 'report-off-rhythm', on: broken.targetOn! }
}

/** #835, TR-25 : le report part avec les autres reports de sa dose et les décalages de sa journée. */
function reportCompanions(input: TreatmentViewInput, report: Line): Line[] {
  return [...doseLines(input, report), ...shiftsOfDay(input, report)]
}

const arrivalLogged = (input: TreatmentViewInput, report: Line): boolean =>
  input.lines.some((other) => isNote(other) && other.dueOn === report.targetOn)

// Q25, N8, G19 : verrouillé comme « Prochaine dose » ramenée au jour d'origine, jamais à moitié.
function reportRemovalRefusal(input: TreatmentViewInput, report: Line): Refusal | null {
  if (shiftsOfDay(input, report).length === 0) return null
  const ignored = [report, ...reportCompanions(input, report)].map(({ id }) => id)
  const after = linesAfter(
    input,
    { settingId: report.settingId, dueOn: livesOn(report) },
    new Set(ignored),
  )
  if (after.notes.length > 0) return { reason: 'later-dose' }
  return after.others.length > 0 ? { reason: 'later-line' } : null
}

/**
 * Pourquoi « Supprimer » est refusé : report, ou report qu'il emporte, dont la dose d'arrivée est
 * notée (Q25), report devenu la première échéance d'un nouveau rythme (#780, R9.2) ou dont le
 * décalage ne peut pas partir avec lui (#835), décalage suivi d'une prise ou d'un report seul qui ne
 * tiendrait plus (N8, G19) ; une ligne sans effet se supprime toujours (R11).
 */
export function removalRefusal(input: TreatmentViewInput, lineId: string): Refusal | null {
  const line = input.lines.find(({ id }) => id === lineId)
  if (line === undefined) throw new RangeError(`Aucune ligne à supprimer : ${lineId}`)
  const effect = buildView(input).history.find((entry) => entry.line.id === lineId)!.effect
  if (effect.kind === 'idle') return null
  if (line.status === 'postponed') {
    const carried = effect.kind === 'moves' ? doseLines(input, line) : []
    const reports = [line, ...carried.filter(({ status }) => status === 'postponed')]
    if (reports.some((report) => arrivalLogged(input, report))) return { reason: 'arrival-logged' }
    if (effect.kind === 'moves' && effect.opensRhythm) return { reason: 'not-movable' }
    return effect.kind === 'moves' ? reportRemovalRefusal(input, line) : null
  }
  return line.status === 'shift' ? shiftRemovalRefusal(input, line) : null
}

/** R11 : seule la personne supprime une ligne ; le décalage d'une prise reste (N6, N8). */
export function removeLine(input: TreatmentViewInput, lineId: string): GestureResult {
  const refusal = removalRefusal(input, lineId)
  if (refusal !== null) return { refusal }
  const removed = input.lines.find(({ id }) => id === lineId)!
  const effect = buildView(input).history.find(({ line }) => line.id === lineId)!.effect
  const companions =
    removed.status === 'postponed' && effect.kind === 'moves'
      ? reportCompanions(input, removed)
      : doseLines(input, removed)
  return outcome(input, [
    { action: 'delete', id: lineId },
    ...companions.map(({ id }): LineChange => ({ action: 'delete', id })),
  ])
}
