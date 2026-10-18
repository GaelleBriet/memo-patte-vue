import type { Journey } from './reference-days'
import { hoursOf, isOnGrid, keyOf, sameFrequency, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce que le modèle sait du carnet autour d'un report. */
export type RewriteContext = {
  settingOf: (id: string) => ReferenceSetting
  /** Le réglage que suit celui-ci dans l'épisode, `undefined` pour le premier. */
  previousOf: (setting: ReferenceSetting) => ReferenceSetting | undefined
  /** Les échéances, prises comprises, du carnet lu sans ce report et sans la règle de #867. */
  duesWithout: (report: ReferenceLine) => ReadonlySet<string>
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

/** #867, #882, #883 : la réécriture a ôté la dose de départ du carnet lu sans le report ; la plus
 * récente des deux écritures l'emporte, la ligne gardant son jour et son heure. */
export function rewrittenDeparture(
  report: ReferenceLine,
  context: RewriteContext,
): Journey | 'lost' | undefined {
  const written = context.settingOf(report.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (report.dueOn < written.startsOn) return undefined
  const dues = context.duesWithout(report)
  if (dues.has(keyOf(report.dueOn, report.dueTime))) return undefined
  const dayStays = [...dues].some((key) => key.slice(0, 10) === report.dueOn)
  const takenAway = dayStays
    ? !hoursOf(written).includes(report.dueTime)
    : report.dueOn < written.firstDueOn ||
      (drawsItsGrid(written, context.previousOf(written)) &&
        !isOnGrid(written.gridOriginOn ?? written.firstDueOn, written.frequency, report.dueOn))
  if (!takenAway) return undefined
  if (rewrittenAt >= report.updatedAt) return 'lost'
  // §11 : une dose encore libre après l'heure ôtée peut être la même dose à une autre heure.
  const later = (hour: Hour) => hour === null || hour >= (report.dueTime ?? '')
  if (dayStays && context.uncovered(report).some(later)) return undefined
  return { setting: written, hours: [report.dueTime] }
}
