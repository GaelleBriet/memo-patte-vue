import type { Journey } from './reference-days'
import { hoursOf, sameFrequency, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce que le modèle sait du carnet autour d'un report. */
export type RewriteContext = {
  settingOf: (id: string) => ReferenceSetting
  /** Le réglage qui porte ce jour-là, jusqu'à sa fin. */
  settingAt: (day: string) => ReferenceSetting | undefined
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

/** #867, #882, #883 : la réécriture a ôté la dose de départ de sa journée telle qu'elle se lit ; la
 * plus récente des deux écritures l'emporte (8a : après la première échéance aussi, quand la
 * réécriture a elle-même ôté la journée). */
export function rewrittenDeparture(
  report: ReferenceLine,
  written: ReferenceSetting,
  context: RewriteContext,
  departure: { hours: readonly Hour[] } | undefined,
): Journey | 'lost' | undefined {
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (report.dueOn < written.startsOn) return undefined
  const kept: Journey = { setting: written, hours: [report.dueTime] }
  if (departure === undefined) {
    if (report.dueOn < written.firstDueOn) return rewrittenAt >= report.updatedAt ? 'lost' : kept
    if (!dayTakenAfterFirstDue(report, written, context)) return undefined
    if (rewrittenAt === report.updatedAt) return undefined
    return rewrittenAt > report.updatedAt ? 'lost' : kept
  }
  if (departure.hours.includes(report.dueTime)) return undefined
  if (hoursOf(written).includes(report.dueTime) || rewrittenAt === report.updatedAt)
    return undefined
  return rewrittenAt > report.updatedAt ? 'lost' : kept
}

// #885, 6c : la ligne plus récente que la réécriture de son réglage, qui a ôté sa journée.
function winsOverRewrite(line: ReferenceLine, context: RewriteContext): boolean {
  const written = context.settingOf(line.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return false
  if (line.dueOn < written.startsOn || line.updatedAt <= rewrittenAt) return false
  return line.dueOn < written.firstDueOn || dayTakenAfterFirstDue(line, written, context)
}

/** #885, 6c : le décalage d'un report plus récent que la réécriture de son réglage tient avec lui. */
export function shiftKeptByReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  context: RewriteContext,
): boolean {
  if (!winsOverRewrite(turn, context)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return reports.some((report) => report.dueOn === turn.dueOn && winsOverRewrite(report, context))
}

/** 6b : le décalage d'un report dont la réécriture plus récente a ôté l'heure part avec lui. */
export function shiftLostWithReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  context: RewriteContext,
  departure: { hours: readonly Hour[] },
): boolean {
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const report = reports.find(
    ({ dueOn, dueTime }) => dueOn === turn.dueOn && dueTime === turn.dueTime,
  )
  if (report === undefined || departure.hours.includes(report.dueTime)) return false
  const written = context.settingOf(report.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return false
  if (report.dueOn < written.startsOn || hoursOf(written).includes(report.dueTime)) return false
  return rewrittenAt > report.updatedAt
}
