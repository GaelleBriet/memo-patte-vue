import { chosenAtOf, hoursOf, isOnGrid, sameFrequency, sameHours } from './grid'
import type { Span } from './settings'
import type { Day, Hour, Line, LineEffect, Setting } from './types'

/** Ce qu'un report prend à une journée : les heures qui la quittent, et celles qui arrivent. */
export type RankedMove = { leaving: Hour[]; carried: Hour[] }

/** Le rang de l'heure d'un report : écrit sur sa ligne, sinon lu dans les heures en vigueur. */
export function rankOf(report: Line, hours: readonly Hour[]): number {
  if (report.dueRank !== undefined && report.dueRank !== null) return report.dueRank
  const due = report.dueTime
  return 1 + hours.filter((hour) => hour !== null && due !== null && hour < due).length
}

/** Q4 : la journée perd la dose libre du rang du report et, avec la case, les rangs suivants. */
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

/** G13, R9 : la journée entière de la date choisie, aux heures de son réglage (#796). */
export function wholeDay(report: Line, hours: readonly Hour[]): Hour[] {
  const sorted = [...hours].sort()
  const rank = rankOf(report, sorted)
  const others = sorted.filter((_, index) => index !== rank - 1)
  return arriving(report, sorted[rank - 1], others)
}

// Q3, Q-b : à l'heure écrite, sauf si un rang qui l'accompagne la prend ou qu'elle est vide.
function arriving(report: Line, own: Hour | undefined, others: readonly Hour[]): Hour[] {
  const empty = report.dueTime === null && own !== null
  const taken = own !== undefined && (empty || others.includes(report.dueTime))
  return [...new Set([taken ? own : report.dueTime, ...others])].sort()
}

/**
 * Q1, R3 : le réglage dont la date choisie était l'ancienne arrivée d'un report redéplacé, quand le
 * report est plus récent que le « Modifier » qui l'a choisie (Q26, Q40).
 */
export function oldArrivalChooser(
  report: Line,
  span: Pick<Span, 'settingAt' | 'live'>,
): Setting | undefined {
  const setting = chosenOldArrival(report, span)
  return setting !== undefined && report.decidedAt > chosenAtOf(setting) ? setting : undefined
}

/**
 * Q26, Q39 (#1231) : plus ancien que le « Modifier » de la date choisie qui était son ancienne arrivée,
 * parti d'une journée que sa grille n'a pas, le report est sans effet, sauf si une dose qu'il apporte
 * a été donnée avant ce « Modifier » (Q41).
 */
export function outdatedByChosenDate(
  report: Line,
  span: Pick<Span, 'settingAt' | 'live'>,
  notes: readonly Line[],
): boolean {
  const setting = chosenOldArrival(report, span)
  if (setting === undefined || report.decidedAt > chosenAtOf(setting)) return false
  if (isOnGrid(setting.firstDueOn, setting.frequency, report.dueOn)) return false
  return !notes.some(
    (note) =>
      note.status === 'given' &&
      note.decidedAt <= chosenAtOf(setting) &&
      note.dueOn === report.targetOn &&
      (report.dueTime === null || note.dueTime === null || note.dueTime >= report.dueTime),
  )
}

/** R6, 6b (Q41) : le décalage suit son report ; sans effet avec lui. */
export function turnOfOutdatedReport(
  turn: Line,
  lines: { reports: readonly Line[]; notes: readonly Line[] },
  span: Pick<Span, 'settingAt' | 'live'>,
): boolean {
  return lines.reports.some(
    (report) =>
      report.dueOn === turn.dueOn &&
      report.targetOn === turn.targetOn &&
      outdatedByChosenDate(report, span, lines.notes),
  )
}

function chosenOldArrival(
  report: Line,
  span: Pick<Span, 'settingAt' | 'live'>,
): Setting | undefined {
  const day = report.previousTargetOn
  if (day === undefined || day === null || day === report.targetOn) return undefined
  let setting = span.settingAt(day)
  let index = setting === undefined ? -1 : span.live.indexOf(setting)
  while (setting !== undefined && setting.gridOriginOn === null && index > 0) {
    const previous: Setting = span.live[index - 1]!
    if (!sameFrequency(previous.frequency, setting.frequency)) return undefined
    setting = previous
    index -= 1
  }
  return setting?.firstDueChosen && setting.firstDueOn === day ? setting : undefined
}

/**
 * R7 : les heures de son ancienne arrivée (`day`) telles que le report les a vues quand il en est reparti :
 * celles du réglage qui la lisait alors, si celui qui la lit aujourd'hui a été écrit après lui (#992).
 */
export function hoursSeenOn(
  report: Line,
  day: Day,
  journey: { setting: Setting; hours: readonly Hour[] },
  live: readonly Setting[],
): readonly Hour[] {
  if (journey.setting.createdAt <= report.decidedAt) return journey.hours
  const seen = live
    .filter(({ startsOn, createdAt }) => startsOn <= day && createdAt <= report.decidedAt)
    .at(-1)
  return seen === undefined || sameHours(seen, journey.setting)
    ? journey.hours
    : hoursOf(seen.times)
}

/** G13 : le réglage dont la date choisie portait la dose que ce décalage fait repartir. */
export function chooserOfTurn(
  turn: Line,
  reports: readonly Line[],
  span: Pick<Span, 'settingAt' | 'live'>,
): Setting | undefined {
  const report = reports.find(
    (each) => each.dueOn === turn.dueOn && each.targetOn === turn.targetOn,
  )
  return report === undefined ? undefined : oldArrivalChooser(report, span)
}

/** R9 : le décalage parti d'avant ce réglage depuis sa date choisie. */
export function earlyTurnOf(
  setting: Setting,
  lines: { shifts: readonly Line[]; reports: readonly Line[] },
  span: Pick<Span, 'settingAt' | 'live'>,
  effects: ReadonlyMap<string, LineEffect>,
): Line | undefined {
  return lines.shifts.find(
    (turn) =>
      turn.dueOn < setting.startsOn &&
      effects.get(turn.id)?.kind === 'shifts' &&
      chooserOfTurn(turn, lines.reports, span) === setting,
  )
}
