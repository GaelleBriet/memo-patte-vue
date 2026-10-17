import { hoursOf } from './grid'
import { isDueDay, type Grid } from './grid-in-force'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

/** La dose de départ d'une ligne manque au calendrier : sa journée (`day`), ou sa seule heure (`hour`). */
type Missing = 'day' | 'hour'

/** #867, #882, #883 : la réécriture d'un réglage contre un report ou un décalage écrit sous lui, dont
 * elle a ôté la dose de départ : `line`, la ligne plus récente l'emporte ; `rewrite`, elle est sans
 * effet. `base` : la grille du réglage réécrit avant ses décalages ; `inForce` : le réglage en vigueur
 * ce jour-là. */
export function rewriteVerdict(
  line: Line,
  written: Setting,
  { missing, base, inForce }: { missing: Missing; base?: Grid; inForce?: Setting },
): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn) return null
  // Une dose ôtée par une autre ligne, pas par la réécriture, ne se juge pas ici.
  const removed =
    missing === 'hour'
      ? !hoursOf(written.times).includes(line.dueTime)
      : line.dueOn < firstDueOn ||
        base === undefined ||
        !isDueDay(base, written.frequency, line.dueOn)
  if (!removed) return null
  if (line.dueOn >= firstDueOn && inForce?.id !== written.id) return null
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}

/** #885 : le décalage d'un report qui l'emporte sur la réécriture de son réglage part de la journée
 * de départ que cette réécriture a ôtée du calendrier. */
export function shiftKeptByReport(
  turn: Line,
  context: {
    reports: readonly Line[]
    isDay: (day: Day) => boolean
    settingOf: (id: string) => Setting
    baseOf: (id: string) => Grid | undefined
    settingAt: (day: Day) => Setting | undefined
  },
): boolean {
  const { reports, isDay, settingOf, baseOf, settingAt } = context
  const wins = (line: Line) =>
    rewriteVerdict(line, settingOf(line.settingId), {
      missing: 'day',
      base: baseOf(line.settingId),
      inForce: settingAt(line.dueOn),
    }) === 'line'
  if (isDay(turn.dueOn) || reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return wins(turn) && reports.some((report) => report.dueOn === turn.dueOn && wins(report))
}

/** #882, #883 : le verdict d'un report dont la dose de départ manque à la journée telle qu'elle
 * était avant les reports déjà lus (`arrived` : les heures qui y sont arrivées). */
export function departureVerdict(
  report: Line,
  context: {
    departure: Journey | undefined
    arrived: readonly Hour[]
    written: Setting
    base: Grid | undefined
    inForce: Setting | undefined
    covered: (day: Journey) => ReadonlyMap<Hour, Line>
  },
): 'line' | 'rewrite' | null {
  const { departure, arrived, written, base, inForce, covered } = context
  if (departure === undefined)
    return rewriteVerdict(report, written, { missing: 'day', base, inForce })
  if ([...hoursOf(departure.setting.times), ...arrived].includes(report.dueTime)) return null
  const verdict = rewriteVerdict(report, written, { missing: 'hour', inForce })
  if (verdict !== 'line') return verdict
  // §11 : une dose encore libre après l'heure ôtée peut être la même dose à une autre heure.
  const noted = covered(departure)
  const free = departure.hours.filter((hour) => !noted.has(hour))
  return free.some((hour) => hour === null || hour >= (report.dueTime ?? '')) ? null : verdict
}
