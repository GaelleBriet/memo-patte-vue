import { sameFrequency } from './grid'
import type { Span } from './settings'
import type { Hour, Line, Setting } from './types'

/** Ce qu'un report prend à une journée : les heures qui la quittent, et celles qui arrivent. */
export type RankedMove = { leaving: Hour[]; carried: Hour[] }

/** Le rang de l'heure d'un report : écrit sur sa ligne, sinon lu dans les heures en vigueur. */
export function rankOf(report: Line, hours: readonly Hour[]): number {
  if (report.dueRank !== undefined && report.dueRank !== null) return report.dueRank
  const due = report.dueTime
  return 1 + hours.filter((hour) => hour !== null && due !== null && hour < due).length
}

/**
 * La dose du report arrive à l'heure écrite du report ; la journée perd la dose libre de son rang
 * (aucune quand ce rang est noté) et, avec « Décaler aussi les doses suivantes », les rangs suivants.
 */
export function rankedMove(
  report: Line,
  hours: readonly Hour[],
  noted: ReadonlySet<Hour>,
  withFollowing: boolean,
): RankedMove {
  const sorted = [...hours].sort()
  const rank = rankOf(report, sorted)
  const own = sorted[rank - 1]
  const leaving: Hour[] = own === undefined || noted.has(own) ? [] : [own]
  const following = withFollowing ? sorted.slice(rank).filter((hour) => !noted.has(hour)) : []
  leaving.push(...following)
  return { leaving, carried: arriving(report, own, following) }
}

/**
 * G13, R9 : avancée avec la case depuis la date choisie qui la portait, la dose du report emmène la
 * journée entière de cette date, aux heures de son réglage (#796).
 */
export function wholeDay(report: Line, hours: readonly Hour[]): Hour[] {
  const sorted = [...hours].sort()
  const rank = rankOf(report, sorted)
  const own = sorted[rank - 1]
  return arriving(
    report,
    own,
    sorted.filter((_, index) => index !== rank - 1),
  )
}

// Q3 : la dose du report arrive à son heure écrite, sauf si un rang qui l'accompagne la prend déjà :
// elle garde alors l'heure de son propre rang, une dose ne se perd pas.
function arriving(report: Line, own: Hour | undefined, others: readonly Hour[]): Hour[] {
  const taken = others.includes(report.dueTime) && own !== undefined
  return [...new Set([taken ? own : report.dueTime, ...others])].sort()
}

/**
 * Le réglage dont la date choisie portait la dose d'un report déplacé de nouveau : première échéance
 * choisie du réglage en vigueur sur l'ancienne arrivée, ou d'un réglage d'avant que celui-ci continue
 * (R3, même fréquence, sans origine propre).
 */
export function oldArrivalChooser(
  report: Line,
  span: Pick<Span, 'settingAt' | 'live'>,
): Setting | undefined {
  const day = report.previousTargetOn
  if (day === undefined || day === null || day === report.targetOn) return undefined
  let setting = span.settingAt(day)
  let index = setting === undefined ? -1 : span.live.indexOf(setting)
  // R3 : en remontant les réglages qui continuent la grille, jusqu'à celui qui l'a tracée.
  while (setting !== undefined && setting.gridOriginOn === null && index > 0) {
    const previous: Setting = span.live[index - 1]!
    if (!sameFrequency(previous.frequency, setting.frequency)) return undefined
    setting = previous
    index -= 1
  }
  return setting?.firstDueChosen && setting.firstDueOn === day ? setting : undefined
}
