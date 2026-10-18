import { hoursOf, isOnGrid, sameFrequency } from './grid'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

/** Ce que la réécriture a pu ôter : `owns`, le réglage a sa propre grille ; `inForce`, le réglage du jour. */
type Reach = { owns: boolean; inForce: Setting | undefined }

// #867 : la journée de départ, ôtée avant la première échéance, se juge dans les deux sens (main).
function beforeFirstDue(line: Line, written: Setting): 'line' | 'rewrite' {
  return line.updatedAt > written.updatedAt! ? 'line' : 'rewrite'
}

// #882 : après la première échéance, seule une réécriture plus récente l'emporte ; un report plus
// récent garde la lecture d'avant, qu'un seul téléphone ne distingue pas d'une journée ôtée ensuite.
function afterFirstDue(line: Line, written: Setting, { owns, inForce }: Reach) {
  const continues =
    inForce === written ||
    (inForce !== undefined &&
      inForce.createdAt > written.createdAt &&
      inForce.gridOriginOn === null &&
      sameFrequency(inForce.frequency, written.frequency))
  const origin = written.gridOriginOn ?? written.firstDueOn
  if (!owns || !continues || isOnGrid(origin, written.frequency, line.dueOn)) return null
  return written.updatedAt! > line.updatedAt ? 'rewrite' : null
}

// #883 : l'heure ôtée des heures du réglage réécrit ; une écriture du même instant ne contredit rien.
function hourTaken(line: Line, written: Setting): 'line' | 'rewrite' | null {
  if (hoursOf(written.times).includes(line.dueTime)) return null
  if (line.updatedAt === written.updatedAt) return null
  return line.updatedAt > written.updatedAt! ? 'line' : 'rewrite'
}

function rewriteVerdict(
  line: Line,
  written: Setting,
  missing: 'day' | 'hour',
  reach: Reach,
): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt || line.dueOn < startsOn) return null
  if (missing === 'hour') return hourTaken(line, written)
  return line.dueOn < firstDueOn
    ? beforeFirstDue(line, written)
    : afterFirstDue(line, written, reach)
}

/** #885 : le décalage d'un report qui l'emporte sur la réécriture de son réglage part de la journée
 * de départ que cette réécriture a ôtée, avant sa première échéance. */
export function shiftKeptByReport(
  turn: Line,
  context: {
    reports: readonly Line[]
    isDay: (day: Day) => boolean
    settingOf: (id: string) => Setting
  },
): boolean {
  const { reports, isDay, settingOf } = context
  if (turn.dueOn >= settingOf(turn.settingId).firstDueOn || isDay(turn.dueOn)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const wins = (line: Line) => {
    const written = settingOf(line.settingId)
    const reach = { owns: false, inForce: undefined }
    return rewriteVerdict(line, written, 'day', reach) === 'line'
  }
  return wins(turn) && reports.some((report) => report.dueOn === turn.dueOn && wins(report))
}

/** #882, #883 : le verdict d'un report dont la dose de départ manque à sa journée, lue sans lui et
 * avec les heures que d'autres reports y ont amenées (`arrived`). */
export function departureVerdict(
  report: Line,
  context: Reach & {
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
