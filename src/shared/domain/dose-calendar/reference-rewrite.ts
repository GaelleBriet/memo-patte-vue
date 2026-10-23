import type { Journey } from './reference-days'
import { hoursOf, sameFrequency, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce que le modèle sait du carnet autour d'un report. */
export type RewriteContext = {
  settingOf: (id: string) => ReferenceSetting
  /** Le réglage qui porte ce jour-là, jusqu'à sa fin. */
  settingAt: (day: string) => ReferenceSetting | undefined
  /** Le réglage dont vient la date choisie que le réglage de ce jour-là continue (TR-9). */
  chooserAt?: (day: string) => ReferenceSetting | undefined
  /** Les réglages lus dans l'ordre. */
  chain: readonly ReferenceSetting[]
  /** Les échéances des seuls réglages `only`, sans ligne. */
  read: (only: ReferenceSetting[]) => ReadonlySet<string>
}

// Une réécriture déplace la grille quand le réglage pose sa propre origine ou change de rythme.
function drawsItsGrid(setting: ReferenceSetting, previous: ReferenceSetting | undefined) {
  return (
    previous === undefined || !sameFrequency(previous, setting) || setting.gridOriginOn !== null
  )
}

// R3 : le réglage qui a tracé la grille du réglage `reading`, le dernier de la chaîne qui pose la sienne.
function drawerOf(reading: ReferenceSetting, chain: readonly ReferenceSetting[]) {
  let drawer: ReferenceSetting | undefined
  for (const [index, setting] of chain.entries()) {
    if (drawsItsGrid(setting, chain[index - 1])) drawer = setting
    if (setting === reading) return drawer
  }
  return undefined
}

// Après la première échéance, la journée manque à la grille du réglage réécrit lu seul, qui a tracé
// celle du réglage portant ce jour-là.
function dayTakenAfterFirstDue(
  report: ReferenceLine,
  written: ReferenceSetting,
  context: RewriteContext,
): boolean {
  const reading = context.settingAt(report.dueOn)
  if (reading === undefined || drawerOf(reading, context.chain) !== written) return false
  return ![...context.read([written])].some((key) => key.slice(0, 10) === report.dueOn)
}

// #939 : les réglages qui lisent la journée de départ, ou dont vient sa date choisie, créés après celui
// du report et réécrits sur place depuis, que la ligne a connus (écrite après leur création).
function laterRewriters(report: ReferenceLine, own: ReferenceSetting, context: RewriteContext) {
  const candidates = [context.settingAt(report.dueOn), context.chooserAt?.(report.dueOn)]
  return candidates.filter(
    (reading): reading is ReferenceSetting =>
      reading !== undefined &&
      reading.id !== own.id &&
      reading.updatedAt !== undefined &&
      reading.updatedAt > reading.createdAt &&
      reading.createdAt > own.createdAt &&
      report.decidedAt > reading.createdAt,
  )
}

/** #867, #882, #939 : la réécriture de la grille a ôté la journée de départ ; la plus récente des
 * deux écritures l'emporte (8a : après la première échéance aussi, quand la réécriture a elle-même
 * ôté la journée). Une heure ôtée n'est jamais un conflit : le report l'emporte. */
export function rewrittenDeparture(
  report: ReferenceLine,
  own: ReferenceSetting,
  context: RewriteContext,
  departure: { hours: readonly Hour[] } | undefined,
): Journey | 'lost' | 'read' | undefined {
  const kept: Journey = { setting: own, hours: [report.dueTime] }
  if (departure !== undefined) {
    const rewrittenAt = own.updatedAt
    if (rewrittenAt === undefined || rewrittenAt <= own.createdAt) return undefined
    if (report.dueOn < own.startsOn || departure.hours.includes(report.dueTime)) return undefined
    return hoursOf(own).includes(report.dueTime) ? undefined : kept
  }
  const outcome = dayTakenBy(report, own, context)
  if (outcome === 'kept') return kept
  if (outcome === 'lost') return outcome
  // #939 : plus récent que la grille d'un réglage réécrit après la création du sien, qui lit sa journée
  // de départ ou son ancienne arrivée, il se lit comme avant, sans être écarté hors de la grille (`read`).
  const previous = report.previousTargetOn
  const days = previous ? [report, { ...report, dueOn: previous }] : [report]
  const read = days.some((line) =>
    laterRewriters(line, own, context).some((later) => dayTakenBy(line, later, context) === 'kept'),
  )
  return read ? 'read' : undefined
}

// La journée de départ ôtée par la réécriture de `written` : le plus récent des deux l'emporte.
function dayTakenBy(
  report: ReferenceLine,
  written: ReferenceSetting,
  context: RewriteContext,
): 'kept' | 'lost' | undefined {
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (report.dueOn < written.startsOn) return undefined
  const gridAt = written.gridWrittenAt ?? rewrittenAt
  if (report.dueOn < written.firstDueOn) return gridAt >= report.decidedAt ? 'lost' : 'kept'
  if (!dayTakenAfterFirstDue(report, written, context)) return undefined
  if (gridAt === report.decidedAt) return undefined
  return gridAt > report.decidedAt ? 'lost' : 'kept'
}

// #885, 6c : la ligne plus récente que la grille de son propre réglage, qui a ôté sa journée.
function winsOverRewrite(line: ReferenceLine, context: RewriteContext): boolean {
  const written = context.settingOf(line.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return false
  const gridAt = written.gridWrittenAt ?? rewrittenAt
  if (line.dueOn < written.startsOn || line.decidedAt <= gridAt) return false
  return line.dueOn < written.firstDueOn || dayTakenAfterFirstDue(line, written, context)
}

/** #885, 6c, Q2 : sa journée sortie de la grille, le décalage d'un report gagnant tient avec lui. */
export function shiftKeptByReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  context: RewriteContext,
): boolean {
  if (!winsOverRewrite(turn, context)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return reports.some((report) => report.dueOn === turn.dueOn && winsOverRewrite(report, context))
}
