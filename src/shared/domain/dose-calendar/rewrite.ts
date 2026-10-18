import { hoursOf, isOnGrid } from './grid'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

/** Ce que la réécriture a pu ôter : `drawnBy`, le réglage qui a tracé la grille du jour. */
type Reach = { drawnBy: string | undefined }

// #867 : la journée de départ, ôtée avant la première échéance, se juge dans les deux sens (main).
function beforeFirstDue(line: Line, written: Setting): 'line' | 'rewrite' {
  return line.updatedAt > written.updatedAt! ? 'line' : 'rewrite'
}

// #882, 8a : après la première échéance, la journée ôtée par la réécriture elle-même (grille propre
// du réglage réécrit), pas par une autre ligne, se juge dans les deux sens.
function afterFirstDue(line: Line, written: Setting, { drawnBy }: Reach) {
  const origin = written.gridOriginOn ?? written.firstDueOn
  if (drawnBy !== written.id || isOnGrid(origin, written.frequency, line.dueOn)) return null
  if (line.updatedAt === written.updatedAt) return null
  return written.updatedAt! > line.updatedAt ? 'rewrite' : 'line'
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

type ShiftContext = {
  reports: readonly Line[]
  settingOf: (id: string) => Setting
  reachOf: (day: Day) => Reach
}

/** #885, 6c : le décalage d'un report qui l'emporte sur la réécriture de son réglage part de la
 * journée de départ que cette réécriture a ôtée, avant comme après sa première échéance. */
export function shiftKeptByReport(
  turn: Line,
  context: ShiftContext & { isDay: (day: Day) => boolean },
): boolean {
  const { reports, isDay, settingOf, reachOf } = context
  if (isDay(turn.dueOn)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const wins = (line: Line) => {
    const written = settingOf(line.settingId)
    return rewriteVerdict(line, written, 'day', reachOf(turn.dueOn)) === 'line'
  }
  return wins(turn) && reports.some((report) => report.dueOn === turn.dueOn && wins(report))
}

/** 6b : le décalage écrit avec un report dont la réécriture plus récente a ôté l'heure de départ
 * part avec lui ; une journée qui reçoit un autre report n'est pas jugée. */
export function shiftLostWithReport(
  turn: Line,
  context: ShiftContext & { departure: Journey },
): boolean {
  const { reports, settingOf, reachOf, departure } = context
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const report = reports.find(
    ({ dueOn, dueTime }) => dueOn === turn.dueOn && dueTime === turn.dueTime,
  )
  if (report === undefined || departure.hours.includes(report.dueTime)) return false
  const written = settingOf(report.settingId)
  return rewriteVerdict(report, written, 'hour', reachOf(turn.dueOn)) === 'rewrite'
}

/** #882, #883 : le verdict d'un report dont la dose de départ manque à sa journée, telle qu'elle se
 * lit avec les heures que d'autres reports y ont amenées (`arrived`). */
export function departureVerdict(
  report: Line,
  context: Reach & {
    departure: Journey | undefined
    arrived: readonly Hour[]
    written: Setting
  },
): 'line' | 'rewrite' | null {
  const { departure, arrived, written } = context
  if (departure === undefined) return rewriteVerdict(report, written, 'day', context)
  if ([...departure.hours, ...arrived].includes(report.dueTime)) return null
  return rewriteVerdict(report, written, 'hour', context)
}

/** 6a : gagnant, le report n'emporte que son heure ; sa journée de départ perd la première dose
 * libre qui la suit, la même dose à une autre heure. */
export function freeDoseTaken(report: Line, free: readonly Hour[]): Hour | undefined {
  return free.find((hour) => hour === null || hour >= (report.dueTime ?? ''))
}
