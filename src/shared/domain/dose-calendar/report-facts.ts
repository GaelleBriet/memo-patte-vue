import type { Day, Hour, Line, LineChange, LineFields, Setting } from './types'

/** Ce qu'une ligne de report garde de son histoire : son arrivée d'avant et le rang de son heure. */
export type ReportFacts = {
  previousTargetOn: Day | null
  previousTargetTime: Hour
  dueRank: number | null
}

type Before = Pick<Line, 'status' | 'dueOn' | 'dueTime' | 'targetOn'> & Partial<ReportFacts>

const NONE: ReportFacts = { previousTargetOn: null, previousTargetTime: null, dueRank: null }

/** Le rang, à partir de 1, d'une heure dans les heures d'un réglage ; `null` : absente. */
export function rankIn(times: readonly string[], dueTime: Hour): number | null {
  const hours: Hour[] = times.length > 0 ? [...times] : [null]
  const index = hours.indexOf(dueTime)
  return index < 0 ? null : index + 1
}

/**
 * Une ligne de report réécrite vers une autre arrivée garde celle d'avant, jour et heure ; à la même
 * échéance, elle garde son rang, sinon il se lit dans les heures de son réglage (`times`).
 */
export function reportFactsOf(
  line: LineFields,
  before: Before | undefined,
  times: readonly string[] | undefined,
): ReportFacts {
  if (line.status !== 'postponed') return NONE
  const report = before?.status === 'postponed' ? before : undefined
  const sameDue = report?.dueOn === line.dueOn && report.dueTime === line.dueTime
  const dueRank =
    sameDue && report?.dueRank !== undefined && report.dueRank !== null
      ? report.dueRank
      : times === undefined
        ? null
        : rankIn(times, line.dueTime)
  if (report === undefined) return { ...NONE, dueRank }
  if (report.targetOn !== line.targetOn) {
    return { previousTargetOn: report.targetOn, previousTargetTime: report.dueTime, dueRank }
  }
  return {
    previousTargetOn: report.previousTargetOn ?? null,
    previousTargetTime: report.previousTargetTime ?? null,
    dueRank,
  }
}

/** Une écriture de ligne avec les faits de report que le repository posera, lus sur le carnet. */
export function withReportFacts<C extends LineChange>(
  lines: readonly Line[],
  settings: readonly Setting[],
  change: C,
): C {
  if (change.action === 'delete' || change.line.status !== 'postponed') return change
  const before = change.action === 'rewrite' ? lines.find(({ id }) => id === change.id) : undefined
  const times = settings.find(({ id }) => id === change.line.settingId)?.times
  return { ...change, line: { ...change.line, ...reportFactsOf(change.line, before, times) } }
}
