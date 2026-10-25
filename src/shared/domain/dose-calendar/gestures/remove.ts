import { isMoreRecent, isTaken } from '../lines'
import type {
  Day,
  GestureResult,
  Line,
  LineChange,
  LineEffect,
  Refusal,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied, without } from './changes'
import { doseLines, shiftsOfDay } from './dose-lines'
import { harm, linesAfter, livesOn, outcome } from './outcome'
import { followerLines, lastOfPair, sharedArrival } from './moved-report'
import { brokenReports } from './reports'

// N8 : la prise de la dose déplacée par le report de la même journée n'est pas une dose plus lointaine.
function shiftRemovalRefusal(input: TreatmentViewInput, shift: Line): Refusal | null {
  const view = buildView(input)
  const arrival = view.history.find(
    ({ line, effect }) =>
      line.status === 'postponed' && effect.kind === 'moves' && line.dueOn === shift.dueOn,
  )?.line.targetOn
  const later = input.lines.some(
    (line) => isTaken(line) && line.dueOn > shift.dueOn && line.dueOn !== arrival,
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

const sharedOf = (input: TreatmentViewInput, view: TreatmentView, report: Line) =>
  sharedArrival(view, report, new Set(reportCompanions(input, report).map(({ id }) => id)))

// Q52 : le dernier report d'une paire défait son geste, le report qui l'avait suivi revient (Q50).
function followerBack(input: TreatmentViewInput, view: TreatmentView, report: Line): LineChange[] {
  const shared = sharedOf(input, view, report)
  if (shared === undefined || shared.previousTargetOn !== report.dueOn) return []
  return lastOfPair(report, shared).id === report.id ? followerLines(shared, report.dueOn) : []
}

const arrivalLogged = (input: TreatmentViewInput, report: Line): boolean =>
  input.lines.some((other) => isTaken(other) && other.dueOn === report.targetOn)

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

function lock(input: TreatmentViewInput, line: Line, effect: LineEffect): Refusal | null {
  if (effect.kind === 'idle' || line.status !== 'postponed') return null
  const carried = effect.kind === 'moves' ? doseLines(input, line) : []
  const reports = [line, ...carried.filter(({ status }) => status === 'postponed')]
  if (reports.some((report) => arrivalLogged(input, report))) return { reason: 'arrival-logged' }
  return effect.kind === 'moves' && effect.opensRhythm ? { reason: 'not-movable' } : null
}

function ownRefusal(
  input: TreatmentViewInput,
  view: TreatmentView,
  line: Line,
  effect: LineEffect,
): Refusal | null {
  if (effect.kind === 'idle') return null
  if (line.status === 'postponed') {
    const locked = lock(input, line, effect)
    if (locked !== null || effect.kind !== 'moves') return locked
    const shared = sharedOf(input, view, line)
    const last = shared === undefined ? line : lastOfPair(line, shared)
    if (last.id !== line.id) return { reason: 'arrival-shared', on: last.dueOn }
    return reportRemovalRefusal(input, line)
  }
  return line.status === 'shift' ? shiftRemovalRefusal(input, line) : null
}

function lineAndEffect(input: TreatmentViewInput, lineId: string, view = buildView(input)) {
  const line = input.lines.find(({ id }) => id === lineId)
  if (line === undefined) throw new RangeError(`Aucune ligne à supprimer : ${lineId}`)
  return { line, effect: view.history.find((entry) => entry.line.id === lineId)!.effect }
}

/**
 * Le refus de « Supprimer » qui verrouille un report : sa dose d'arrivée, ou celle d'un report qu'il
 * emporte, est notée (Q25), ou il est devenu la première échéance d'un nouveau rythme (#780, R9.2).
 */
export function reportRemovalLock(input: TreatmentViewInput, lineId: string): Refusal | null {
  const { line, effect } = lineAndEffect(input, lineId)
  return lock(input, line, effect)
}

function removal(input: TreatmentViewInput, lineId: string) {
  const before = buildView(input)
  const { line, effect } = lineAndEffect(input, lineId, before)
  const companions =
    line.status === 'postponed' && effect.kind === 'moves'
      ? reportCompanions(input, line)
      : doseLines(input, line)
  const back =
    line.status === 'postponed' && effect.kind === 'moves' ? followerBack(input, before, line) : []
  const changes = [
    ...[line, ...companions].map(({ id }): LineChange => ({ action: 'delete', id })),
    ...back,
  ]
  const refusal =
    ownRefusal(input, before, line, effect) ??
    harm(before, buildView(applied(input, changes)), input.settings, changes)
  return { changes, refusal }
}

/**
 * Pourquoi « Supprimer » est refusé : report, ou report qu'il emporte, dont la dose d'arrivée est
 * notée (Q25), report devenu la première échéance d'un nouveau rythme (#780, R9.2) ou dont le
 * décalage ne peut pas partir avec lui (#835), décalage suivi d'une prise ou d'un report seul qui ne
 * tiendrait plus (N8, G19), et, pour toute ligne, le refus du geste écrit (R6, R7) ; une ligne sans
 * effet se supprime toujours (R11).
 */
export function removalRefusal(input: TreatmentViewInput, lineId: string): Refusal | null {
  return removal(input, lineId).refusal
}

const daysOf = ({ dueOn, targetOn }: Line): Day[] =>
  targetOn === null ? [dueOn] : [dueOn, targetOn]

const shareDay = (a: Line, b: Line): boolean => daysOf(a).some((day) => daysOf(b).includes(day))

// #867 : réécrit, ce report passerait devant la réécriture de son réglage.
const olderThanItsSetting = (input: TreatmentViewInput, line: Line): boolean => {
  const rewrittenAt = input.settings.find(({ id }) => id === line.settingId)?.updatedAt
  return line.status === 'postponed' && rewrittenAt !== undefined && rewrittenAt >= line.decidedAt
}

/**
 * R12, #842 : les lignes plus récentes qu'une ligne supprimée dans une de ses journées, de proche en
 * proche, de la moins à la plus récente : « Annuler » doit les laisser devant les lignes rétablies.
 */
export function keptAhead(input: TreatmentViewInput, deletedIds: readonly string[]): Line[] {
  const reached = input.lines.filter(({ id }) => deletedIds.includes(id))
  let frontier = [...reached]
  while (frontier.length > 0) {
    frontier = input.lines.filter(
      (line) =>
        !reached.includes(line) &&
        frontier.some((other) => isMoreRecent(line, other) && shareDay(line, other)),
    )
    reached.push(...frontier)
  }
  const ahead = reached
    .filter(({ id }) => !deletedIds.includes(id))
    .sort((a, b) => (isMoreRecent(a, b) ? 1 : -1))
  return ahead.some((line) => olderThanItsSetting(input, line)) ? [] : ahead
}

/** R11 : seule la personne supprime une ligne ; le décalage d'une prise reste (N6, N8). */
export function removeLine(input: TreatmentViewInput, lineId: string): GestureResult {
  const { changes, refusal } = removal(input, lineId)
  return refusal === null ? outcome(input, changes) : { refusal }
}
