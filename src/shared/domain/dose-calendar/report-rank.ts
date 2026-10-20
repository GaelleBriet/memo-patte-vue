import { sameFrequency } from './grid'
import type { Span } from './settings'
import type { Hour, Line } from './types'

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
  const carried: Hour[] = [report.dueTime]
  if (withFollowing) {
    const following = sorted.slice(rank).filter((hour) => !noted.has(hour))
    leaving.push(...following)
    carried.push(...following)
  }
  return { leaving, carried: [...new Set(carried)].sort() }
}

/**
 * La date choisie qui portait la dose d'un report déplacé de nouveau : son ancienne arrivée, première
 * échéance choisie du réglage en vigueur, ou d'un réglage d'avant que celui-ci continue (R3, même
 * fréquence, sans origine propre).
 */
export function chosenOldArrival(report: Line, span: Pick<Span, 'settingAt' | 'live'>) {
  const day = report.previousTargetOn
  if (day === undefined || day === null || day === report.targetOn) return undefined
  const setting = span.settingAt(day)
  if (setting === undefined) return undefined
  if (setting.firstDueChosen && setting.firstDueOn === day) return day
  if (setting.gridOriginOn !== null) return undefined
  const chooser = span.live.find(
    (each) =>
      each.createdAt < setting.createdAt &&
      each.firstDueChosen &&
      each.firstDueOn === day &&
      sameFrequency(each.frequency, setting.frequency),
  )
  return chooser === undefined ? undefined : day
}
