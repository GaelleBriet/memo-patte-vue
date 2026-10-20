import { gridDateOf, hoursOf, isOnGrid } from './grid'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

/** Ce que la réécriture a pu ôter : `drawnBy`, le réglage qui a tracé la grille du jour. */
type Reach = { drawnBy: string | undefined }

// #867 : la journée de départ, ôtée avant la première échéance, se juge dans les deux sens.
function beforeFirstDue(line: Line, gridAt: string): 'line' | 'rewrite' {
  return line.updatedAt > gridAt ? 'line' : 'rewrite'
}

// #882, 8a : après la première échéance, la journée ôtée par la réécriture elle-même (grille propre
// du réglage réécrit), pas par une autre ligne, se juge dans les deux sens.
function afterFirstDue(line: Line, written: Setting, gridAt: string, { drawnBy }: Reach) {
  const origin = written.gridOriginOn ?? written.firstDueOn
  if (drawnBy !== written.id || isOnGrid(origin, written.frequency, line.dueOn)) return null
  if (line.updatedAt === gridAt) return null
  return gridAt > line.updatedAt ? 'rewrite' : 'line'
}

// #939 : un report n'entre jamais en conflit avec les heures ; l'heure ôtée par la réécriture, il
// l'emporte et part par son rang (Q4).
function hourTaken(line: Line, written: Setting): 'line' | null {
  return hoursOf(written.times).includes(line.dueTime) ? null : 'line'
}

// #939 : la journée de départ ôtée par la réécriture sur place se juge contre la dernière écriture de
// la grille du réglage, jamais contre ses heures.
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

/** #885, 6c, Q2 : la journée de départ sortie de la grille, le décalage suit le report qui l'emporte
 * sur la réécriture de son propre réglage, avant comme après sa première échéance. */
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

/** Le réglage qui lit une journée, et celui qui a tracé sa grille. */
type Reading = Reach & { setting: Setting | undefined }

// #939 : la journée de départ, ou l'ancienne arrivée d'un report redéplacé, ôtée ; plus récent que la
// grille du réglage qui la lit, réécrit sur place après la création de celui du report, le report se
// lit comme avant sans être écarté (`kept`).
function dayVerdict(report: Line, own: Setting, readings: readonly [Line, Reading][]) {
  const verdict = rewriteVerdict(report, own, 'day', readings[0]![1])
  if (verdict !== null) return verdict
  const kept = readings.some(([line, reading]) => {
    const newer = newerRewritten(line, own, reading.setting)
    return newer !== null && rewriteVerdict(line, newer, 'day', reading) === 'line'
  })
  return kept ? 'kept' : null
}

/** #882, #883, #939 : le verdict d'un report dont la dose de départ manque à sa journée, telle qu'elle
 * se lit avec les heures que d'autres reports y ont amenées (`arrived`) ; `reading` et `oldReading` :
 * les réglages qui lisent sa journée de départ et son ancienne arrivée ; `kept` : la lecture d'avant,
 * sans être écarté hors de la grille. */
export function departureVerdict(
  report: Line,
  context: Reach & {
    departure: Journey | undefined
    arrived: readonly Hour[]
    written: Setting
    reading: Setting | undefined
    oldReading?: Reading
  },
): 'line' | 'rewrite' | 'kept' | null {
  const { departure, arrived, written, reading, oldReading } = context
  if (departure === undefined) {
    const readings: [Line, Reading][] = [[report, { ...context, setting: reading }]]
    const oldOn = report.previousTargetOn
    if (oldReading !== undefined && oldOn !== undefined && oldOn !== null) {
      readings.push([{ ...report, dueOn: oldOn }, oldReading])
    }
    return dayVerdict(report, written, readings)
  }
  if ([...departure.hours, ...arrived].includes(report.dueTime)) return null
  return rewriteVerdict(report, written, 'hour', context)
}
