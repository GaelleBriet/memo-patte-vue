import type { Journey } from './reference-days'
import { hoursOf, isDueDay, type Grid, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce que le modèle sait des réglages : leur grille avant décalages, celui en vigueur un jour donné. */
export type RewriteWorld = {
  settingOf: (id: string) => ReferenceSetting
  settingAt: (day: string) => ReferenceSetting | undefined
  gridOf: (settingId: string) => Grid | undefined
}

// #867, #882, #883 : la ligne et la réécriture de son réglage, faite ailleurs, se contredisent quand
// celle-ci a ôté la dose de départ (journée ou heure) ; la plus récente des deux écritures l'emporte.
function newerThanRewrite(
  line: ReferenceLine,
  world: RewriteWorld,
  lacking: 'day' | 'hour',
): boolean | undefined {
  const written = world.settingOf(line.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (line.dueOn < written.startsOn) return undefined
  const beforeFirstDue = line.dueOn < written.firstDueOn
  const grid = world.gridOf(written.id)
  const takenAway =
    lacking === 'hour'
      ? !hoursOf(written).includes(line.dueTime)
      : beforeFirstDue || grid === undefined || !isDueDay(grid, written, line.dueOn)
  if (!takenAway) return undefined
  if (!beforeFirstDue && world.settingAt(line.dueOn) !== written) return undefined
  return line.updatedAt > rewrittenAt
}

function departureAfterRewrite(
  report: ReferenceLine,
  world: RewriteWorld,
  lacking: 'day' | 'hour',
): Journey | 'lost' | undefined {
  const newer = newerThanRewrite(report, world, lacking)
  if (newer === undefined) return undefined
  if (!newer) return 'lost'
  return { setting: world.settingOf(report.settingId), hours: [report.dueTime] }
}

/** #885 : le décalage d'un report plus récent que la réécriture de son réglage tient avec lui. */
export function shiftKeptByReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  world: RewriteWorld,
): boolean {
  if (newerThanRewrite(turn, world, 'day') !== true) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return reports.some(
    (report) =>
      report.dueOn === turn.dueOn &&
      typeof departureAfterRewrite(report, world, 'day') === 'object',
  )
}

/** #882, #883 : la dose de départ du report, jour et heure, que la journée portait avant les reports
 * déjà lus (`arrived` : les heures qui y sont arrivées) ; ôtée par la réécriture de son réglage, la
 * plus récente des deux écritures l'emporte. */
export function rewrittenDeparture(
  report: ReferenceLine,
  dayOfDeparture: Journey | undefined,
  context: { arrived: readonly Hour[]; uncovered: (day: Journey) => Hour[]; world: RewriteWorld },
): Journey | 'lost' | undefined {
  const { arrived, uncovered, world } = context
  if (dayOfDeparture === undefined) return departureAfterRewrite(report, world, 'day')
  if ([...hoursOf(dayOfDeparture.setting), ...arrived].includes(report.dueTime)) return undefined
  const outcome = departureAfterRewrite(report, world, 'hour')
  if (outcome === undefined || outcome === 'lost') return outcome
  // §11 : une dose encore libre après l'heure ôtée peut être la même dose à une autre heure.
  const after = (hour: Hour) => hour === null || hour >= (report.dueTime ?? '')
  return uncovered(dayOfDeparture).some(after) ? undefined : outcome
}
