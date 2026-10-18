import { hoursOf } from './grid'
import { isDueDay, type Grid } from './grid-in-force'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

type Rewritten = { base: Grid | undefined; owns: boolean }

// #867, #882, #883 : seule une dose ôtée par la réécriture elle-même se juge ici ; `line`, la ligne
// plus récente l'emporte, `rewrite`, elle est sans effet.
function rewriteVerdict(
  line: Line,
  written: Setting,
  missing: 'day' | 'hour',
  { base, owns }: Rewritten,
): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn) return null
  const removed =
    missing === 'hour'
      ? !hoursOf(written.times).includes(line.dueTime)
      : line.dueOn < firstDueOn ||
        (owns && (base === undefined || !isDueDay(base, written.frequency, line.dueOn)))
  if (!removed) return null
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}

/** #885 : le décalage d'un report qui l'emporte sur la réécriture de son réglage part de la journée
 * de départ que cette réécriture a ôtée, avant sa première échéance. */
export function shiftKeptByReport(
  turn: Line,
  context: {
    reports: readonly Line[]
    isDay: (day: Day) => boolean
    settingOf: (id: string) => Setting
    baseOf: (id: string) => Grid | undefined
  },
): boolean {
  const { reports, isDay, settingOf, baseOf } = context
  const written = settingOf(turn.settingId)
  if (turn.dueOn >= written.firstDueOn || isDay(turn.dueOn)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const wins = (line: Line) =>
    rewriteVerdict(line, settingOf(line.settingId), 'day', {
      base: baseOf(line.settingId),
      owns: false,
    }) === 'line'
  return wins(turn) && reports.some((report) => report.dueOn === turn.dueOn && wins(report))
}

/** #882, #883 : le verdict d'un report dont la dose de départ manque à sa journée, lue sans lui et
 * avec les heures que d'autres reports y ont amenées (`arrived`). */
export function departureVerdict(
  report: Line,
  context: Rewritten & {
    departure: Journey | undefined
    relit: Journey | undefined
    arrived: readonly Hour[]
    written: Setting
    covered: (day: Journey) => ReadonlyMap<Hour, Line>
  },
): 'line' | 'rewrite' | null {
  const { departure, relit, arrived, written, covered } = context
  if (departure === undefined) return rewriteVerdict(report, written, 'day', context)
  const hours = relit?.hours ?? hoursOf(departure.setting.times)
  if ([...hours, ...arrived].includes(report.dueTime)) return null
  const verdict = rewriteVerdict(report, written, 'hour', context)
  if (verdict !== 'line') return verdict
  // §11 : une dose encore libre après l'heure ôtée peut être la même dose à une autre heure.
  const noted = covered(departure)
  const free = departure.hours.filter((hour) => !noted.has(hour))
  return free.some((hour) => hour === null || hour >= (report.dueTime ?? '')) ? null : verdict
}
