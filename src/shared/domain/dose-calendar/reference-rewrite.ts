import type { Journey } from './reference-days'
import { hoursOf, keyOf, sameFrequency, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce que le modèle sait du carnet autour d'un report. */
export type RewriteContext = {
  settingOf: (id: string) => ReferenceSetting
  /** Le réglage qui porte ce jour-là, jusqu'à sa fin. */
  settingAt: (day: string) => ReferenceSetting | undefined
  /** Les réglages lus dans l'ordre. */
  chain: readonly ReferenceSetting[]
  lines: readonly ReferenceLine[]
  /** Les échéances, prises comprises, sans la règle de #867 : du carnet, ou des seuls réglages `only`. */
  read: (only: ReferenceSetting[] | undefined, lines: ReferenceLine[]) => ReadonlySet<string>
  /** Les heures encore sans prise de sa journée, lue avec lui. */
  uncovered: (report: ReferenceLine) => Hour[]
}

// #867 avant la première échéance : la ligne écrite après la réécriture de son réglage.
function newerBeforeFirstDue(line: ReferenceLine, written: ReferenceSetting): boolean {
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return false
  if (line.dueOn < written.startsOn || line.dueOn >= written.firstDueOn) return false
  return line.updatedAt > rewrittenAt
}

/** #885 : le décalage d'un report plus récent que la réécriture de son réglage tient avec lui. */
export function shiftKeptByReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  settingOf: (id: string) => ReferenceSetting,
): boolean {
  if (!newerBeforeFirstDue(turn, settingOf(turn.settingId))) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return reports.some(
    (report) =>
      report.dueOn === turn.dueOn && newerBeforeFirstDue(report, settingOf(report.settingId)),
  )
}

// Une réécriture déplace la grille quand le réglage pose sa propre origine ou change de rythme.
function drawsItsGrid(setting: ReferenceSetting, previous: ReferenceSetting | undefined) {
  return (
    previous === undefined || !sameFrequency(previous, setting) || setting.gridOriginOn !== null
  )
}

// Après la première échéance, la journée manque au réglage réécrit lu seul, lui-même ou un réglage
// qui reprend sa grille sans la changer portant ce jour-là.
function dayTakenAfterFirstDue(report: ReferenceLine, context: RewriteContext): boolean {
  const written = context.settingOf(report.settingId)
  if (!drawsItsGrid(written, context.chain[context.chain.indexOf(written) - 1])) return false
  const reading = context.settingAt(report.dueOn)
  const sameGrid =
    reading === written ||
    (reading !== undefined &&
      reading.createdAt > written.createdAt &&
      reading.gridOriginOn === null &&
      sameFrequency(reading, written))
  if (!sameGrid) return false
  return ![...context.read([written], [])].some((key) => key.slice(0, 10) === report.dueOn)
}

/** #867, #882, #883 : la réécriture a ôté la dose de départ du carnet lu sans le report ; la plus
 * récente des deux écritures l'emporte, sauf un report plus récent après la première échéance. */
export function rewrittenDeparture(
  report: ReferenceLine,
  context: RewriteContext,
): Journey | 'lost' | undefined {
  const written = context.settingOf(report.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (report.dueOn < written.startsOn) return undefined
  const dues = context.read(
    undefined,
    context.lines.filter((line) => line !== report),
  )
  if (dues.has(keyOf(report.dueOn, report.dueTime))) return undefined
  const kept: Journey = { setting: written, hours: [report.dueTime] }
  if (![...dues].some((key) => key.slice(0, 10) === report.dueOn)) {
    if (report.dueOn < written.firstDueOn) return rewrittenAt >= report.updatedAt ? 'lost' : kept
    return rewrittenAt > report.updatedAt && dayTakenAfterFirstDue(report, context)
      ? 'lost'
      : undefined
  }
  if (hoursOf(written).includes(report.dueTime) || rewrittenAt === report.updatedAt)
    return undefined
  if (rewrittenAt > report.updatedAt) return 'lost'
  // §11 : une dose encore libre après l'heure ôtée peut être la même dose à une autre heure.
  const later = (hour: Hour) => hour === null || hour >= (report.dueTime ?? '')
  return context.uncovered(report).some(later) ? undefined : kept
}
