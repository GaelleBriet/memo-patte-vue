import { gridDateOf, hoursOf, isOnGrid } from './grid'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

/** Ce que la réécriture a pu ôter : `drawnBy`, le réglage qui a tracé la grille du jour. */
type Reach = { drawnBy: string | undefined }

// #867 : la journée de départ, ôtée avant la première échéance, se juge dans les deux sens.
function beforeFirstDue(line: Line, gridAt: string): 'line' | 'rewrite' {
  return line.updatedAt > gridAt ? 'line' : 'rewrite'
}

// #882, 8a : après la première échéance, la journée ôtée par la réécriture elle-même, dans les deux sens.
function afterFirstDue(line: Line, written: Setting, gridAt: string, { drawnBy }: Reach) {
  const origin = written.gridOriginOn ?? written.firstDueOn
  if (drawnBy !== written.id || isOnGrid(origin, written.frequency, line.dueOn)) return null
  if (line.updatedAt === gridAt) return null
  return gridAt > line.updatedAt ? 'rewrite' : 'line'
}

// #939, Q4 : une heure ôtée n'est jamais un conflit, le report part par son rang.
function hourTaken(line: Line, written: Setting): 'line' | null {
  return hoursOf(written.times).includes(line.dueTime) ? null : 'line'
}

// #939 : la journée ôtée se juge contre la date de grille du réglage, jamais contre ses heures.
function rewriteVerdict(
  line: Line,
  written: Setting,
  missing: 'day' | 'hour',
  reach: Reach,
): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt } = written
  if (updatedAt === undefined || updatedAt <= createdAt || line.dueOn < written.startsOn)
    return null
  if (missing === 'hour') return hourTaken(line, written)
  const gridAt = gridDateOf(written)
  return line.dueOn < written.firstDueOn
    ? beforeFirstDue(line, gridAt)
    : afterFirstDue(line, written, gridAt, reach)
}

type ShiftContext = {
  reports: readonly Line[]
  settingOf: (id: string) => Setting
  reachOf: (day: Day) => Reach
  isDay: (day: Day) => boolean
}

/** #885, 6c, Q2 : journée sortie de la grille, le décalage suit le report qui gagne contre la réécriture. */
export function shiftKeptByReport(turn: Line, context: ShiftContext): boolean {
  const { reports, isDay, settingOf, reachOf } = context
  if (isDay(turn.dueOn)) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  const wins = (line: Line) =>
    rewriteVerdict(line, settingOf(line.settingId), 'day', reachOf(turn.dueOn)) === 'line'
  return wins(turn) && reports.some((report) => report.dueOn === turn.dueOn && wins(report))
}

// #939 : un réglage plus récent que celui du report, réécrit sur place, que la ligne a connu.
function newerRewritten(report: Line, own: Setting, reading: Setting | undefined): Setting | null {
  if (reading === undefined || reading.id === own.id || reading.createdAt <= own.createdAt)
    return null
  const rewritten = reading.updatedAt !== undefined && reading.updatedAt > reading.createdAt
  return rewritten && report.updatedAt > reading.createdAt ? reading : null
}

/** Un réglage qui lit une journée du report (départ ou ancienne arrivée), ou dont vient sa date choisie. */
export type Reading = Reach & { day: Day; setting: Setting | undefined }

// #939 : journée ôtée ; plus récent que la grille d'un réglage plus récent qui la lit, réécrit sur
// place, le report se lit comme avant sans être écarté (`kept`).
function dayVerdict(report: Line, own: Setting, reach: Reach, readings: readonly Reading[]) {
  const verdict = rewriteVerdict(report, own, 'day', reach)
  if (verdict !== null) return verdict
  const kept = readings.some((reading) => {
    const line = { ...report, dueOn: reading.day }
    const newer = newerRewritten(line, own, reading.setting)
    return newer !== null && rewriteVerdict(line, newer, 'day', reading) === 'line'
  })
  return kept ? 'kept' : null
}

/** #882, #883, #939 : le verdict d'un report dont la dose de départ manque à sa journée. */
export function departureVerdict(
  report: Line,
  context: Reach & {
    departure: Journey | undefined
    arrived: readonly Hour[]
    written: Setting
    readings: readonly Reading[]
  },
): 'line' | 'rewrite' | 'kept' | null {
  const { departure, arrived, written, readings } = context
  if (departure === undefined) return dayVerdict(report, written, context, readings)
  if ([...departure.hours, ...arrived].includes(report.dueTime)) return null
  return rewriteVerdict(report, written, 'hour', context)
}
