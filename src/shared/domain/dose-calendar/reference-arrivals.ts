import { writtenBefore, type coverages, type Journey } from './reference-days'
import { hoursOf, keyOf } from './reference-grid'
import { arrivedOn, chosenDateOf, hoursChangedSince, reportOutcome } from './reference-reports'
import { rewrittenDeparture, type RewriteContext } from './reference-rewrite'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

type Hour = string | null

export type ArrivalContext = {
  reports: readonly ReferenceLine[]
  days: Map<string, Journey>
  left: Map<string, Journey>
  notes: readonly ReferenceLine[]
  noted: ReadonlySet<string>
  coverage: ReturnType<typeof coverages>
  restarts: ReadonlyMap<string, string>
  chosenRestarts: ReadonlyMap<string, string>
  openings: Set<string>
  translated: ReadonlySet<string>
  live: readonly ReferenceSetting[]
  settingOf: (id: string) => ReferenceSetting
  settingAt: (day: string) => ReferenceSetting | undefined
  stoppedAt: (day: string) => ReferenceSetting | undefined
  rewrite: RewriteContext | undefined
}

/** R7 : chaque report part de sa journée et arrive sur la sienne ; ceux qui arrivent sur sa journée d'abord. */
export function arriveReports(context: ArrivalContext) {
  const { days, left, notes, noted, coverage, restarts, chosenRestarts, openings } = context
  const { translated, live, settingOf, settingAt, stoppedAt, rewrite } = context
  const { matched, coveredOn, coveredAside } = coverage
  const fallen = new Set<string>()
  const arrivedBy = new Map<string, ReferenceLine>()
  const arrivedHours = new Map<string, Hour[]>()
  const waiting = [...context.reports]
  while (waiting.length > 0) {
    const ready = waiting.findIndex(
      (report) => !waiting.some((other) => other.targetOn === report.dueOn),
    )
    const [report] = waiting.splice(Math.max(0, ready), 1)
    const { dueOn, targetOn } = report!
    const rewritten = rewrite === undefined ? undefined : rewrittenDeparture(report!, rewrite)
    if (rewritten === 'lost') continue
    const origin = rewritten ? undefined : (days.get(dueOn) ?? left.get(dueOn))
    const from = origin?.setting ?? settingOf(report!.settingId)
    const hours = origin?.hours ?? rewritten?.hours ?? hoursOf(from)
    if (origin === undefined) {
      notes
        .filter((note) => note.dueOn === dueOn && hours.includes(note.dueTime))
        .forEach((note) => matched.add(note))
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : coveredOn(dueOn, origin)
    // R6, TR-9 : hors de sa grille, un report est sans effet, sauf s'il porte la date choisie,
    // arrive sur la première échéance d'une origine écrite (TR-28) ou ouvre un rythme (R9.2).
    const at = settingAt(dueOn)?.id ?? ''
    const restartOn = restarts.get(at)
    const chosenOn = chosenRestarts.get(at)
    const carries = targetOn === restartOn || targetOn === chosenOn || openings.has(targetOn!)
    const before = chosenRestarts.get(report!.settingId) !== chosenOn
    const outside = (dueOn === chosenOn && before) || (!origin && !rewritten && !carries)
    if (chosenOn !== undefined && outside) continue
    const written = settingOf(report!.settingId)
    const arrived = arrivedHours.get(dueOn) ?? []
    const itsDay = {
      setting: written,
      hours: [...new Set([...hoursOf(written), ...arrived])].sort(),
    }
    const outcome = reportOutcome({
      report: report!,
      written,
      day: origin ?? { setting: from, hours },
      covered,
      hoursChangeThatDay: translated.has(dueOn),
      inForce: settingAt(dueOn),
      hoursChangedSince: hoursChangedSince(live, written, dueOn),
      itsHours: itsDay.hours,
      coveredAtItsHours: coveredAside(dueOn, itsDay, writtenBefore(written, settingOf)),
    })
    if (outcome.beaten) continue
    if (targetOn! > dueOn) fallen.add(dueOn)
    if (origin) origin.hours = origin.hours.filter((hour) => !outcome.lost.includes(hour))
    const stopDay = stoppedAt(targetOn!)
    const arrival = settingAt(targetOn!) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (arrival === undefined || outcome.carried.length === 0) continue
    const opensRhythm = openings.delete(targetOn!)
    const chosen = chosenDateOf(report!, live, settingOf)
    const day = arrivedOn(into.get(targetOn!), outcome, arrival, { opensRhythm, chosen })
    into.set(targetOn!, day)
    const received = chosen ? hoursOf(chosen) : outcome.carried
    arrivedHours.set(targetOn!, [...(arrivedHours.get(targetOn!) ?? []), ...received])
    received.forEach((hour) => arrivedBy.set(keyOf(targetOn!, hour), report!))
  }
  return { fallen, arrivedBy }
}
