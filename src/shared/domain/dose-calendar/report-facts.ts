import type { Day, Hour, Line, LineChange, LineFields, Setting } from './types'

/** Ce qu'une ligne de report garde de son histoire : son arrivée d'avant et le rang de son heure. */
export type ReportFacts = {
  previousTargetOn: Day | null
  previousTargetTime: Hour
  dueRank: number | null
}

type Before = Pick<Line, 'status' | 'dueOn' | 'dueTime' | 'targetOn'> & Partial<ReportFacts>

/** Ce que l'écriture d'un report lit du carnet : les lignes écrites et les heures des réglages. */
type Book = {
  lines: readonly (Before & { id: string })[]
  settings: readonly { id: string; times: readonly string[] }[]
}

const NONE: ReportFacts = { previousTargetOn: null, previousTargetTime: null, dueRank: null }

function rankIn(times: readonly string[], dueTime: Hour): number | null {
  const hours: Hour[] = times.length > 0 ? [...times].sort() : [null]
  const index = hours.indexOf(dueTime)
  return index < 0 ? null : index + 1
}

/**
 * Une ligne de report réécrite vers une autre arrivée garde celle d'avant, jour et heure (l'heure
 * touchée, quand le geste la donne) ; à la même échéance, elle garde son rang, sinon il se lit dans
 * les heures de son réglage (`times`).
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
    const previousTargetTime =
      line.previousTargetTime !== undefined ? line.previousTargetTime : report.dueTime
    return { previousTargetOn: report.targetOn, previousTargetTime, dueRank }
  }
  return {
    previousTargetOn: report.previousTargetOn ?? null,
    previousTargetTime: report.previousTargetTime ?? null,
    dueRank,
  }
}

/** Les faits d'un report écrit sur le carnet ; `id` : la ligne qu'il réécrit. */
export function reportFactsIn(book: Book, line: LineFields, id?: string): ReportFacts {
  const before = id === undefined ? undefined : book.lines.find((each) => each.id === id)
  const times = book.settings.find((setting) => setting.id === line.settingId)?.times
  return reportFactsOf(line, before, times)
}

/** Une écriture de ligne avec les faits de report que le repository posera, lus sur le carnet. */
export function withReportFacts<C extends LineChange>(
  lines: readonly Line[],
  settings: readonly Setting[],
  change: C,
): C {
  if (change.action === 'delete' || change.line.status !== 'postponed') return change
  const id = change.action === 'rewrite' ? change.id : undefined
  return {
    ...change,
    line: { ...change.line, ...reportFactsIn({ lines, settings }, change.line, id) },
  }
}
