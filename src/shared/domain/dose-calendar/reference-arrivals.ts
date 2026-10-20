import { writtenBefore, type coverages, type Journey } from './reference-days'
import { hoursOf, keyOf } from './reference-grid'
import { arrivedOn, chosenDateOf, hoursChangedSince, reportOutcome } from './reference-reports'
import { chosenDayOf, takenByRank } from './reference-ranks'
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
  /** Les jours qui portent une ligne de décalage. */
  shiftedDays: ReadonlySet<string>
  /** G13 : les déplacements (`départ>arrivée`) dont le décalage est parti de la date choisie. */
  turnedFromChosen: ReadonlySet<string>
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
    const departure = days.get(dueOn)
    const withFollowing = context.shiftedDays.has(dueOn)
    // Q1 : la dose du report est sur la date choisie qui était son arrivée ; elle en part par son rang.
    const chosenDay = chosenDayOf(report!, settingAt)
    const oldArrival = chosenDay === undefined ? undefined : days.get(chosenDay)
    if (oldArrival !== undefined) {
      // Ce que le report emporte de sa journée de départ, si elle se lit encore, arrive aussi.
      let leftDeparture: Hour[] = []
      if (departure !== undefined) {
        const taken = coveredAside(dueOn, departure)
        const stays = (hour: Hour) =>
          taken.has(hour) || (hour !== null && hour < (report!.dueTime ?? ''))
        leftDeparture = departure.hours.filter((hour) => !stays(hour))
        departure.hours = departure.hours.filter(stays)
      }
      const byRank = takenByRank(
        report!,
        oldArrival.hours,
        coveredAside(chosenDay!, oldArrival),
        withFollowing,
      )
      // G13 : son décalage a déjà fait avancer jusqu'à la date choisie les doses qui la suivaient.
      const turned = context.turnedFromChosen.has(`${dueOn}>${targetOn}`)
      if (!turned) oldArrival.hours = oldArrival.hours.filter((hour) => !byRank.lost.includes(hour))
      if (targetOn! > dueOn) fallen.add(dueOn)
      const carried = [
        ...new Set([report!.dueTime, ...byRank.alsoCarried, ...leftDeparture]),
      ].sort()
      land(report!, { carried, hoursOf: settingOf(report!.settingId) })
      continue
    }
    const rewritten =
      rewrite === undefined
        ? undefined
        : rewrittenDeparture(report!, settingOf(report!.settingId), rewrite, departure)
    if (rewritten === 'lost') continue
    // Q4 : gagnant, le report emporte son heure ; sa journée perd la dose libre de son rang.
    let alsoCarried: Hour[] = []
    if (rewritten !== undefined && departure !== undefined) {
      const byRank = takenByRank(
        report!,
        departure.hours,
        coveredAside(dueOn, departure),
        withFollowing,
      )
      departure.hours = departure.hours.filter((hour) => !byRank.lost.includes(hour))
      alsoCarried = byRank.alsoCarried
    }
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
    const carried = [...new Set([...outcome.carried, ...alsoCarried])].sort()
    land(report!, { carried, hoursOf: outcome.hoursOf })
  }
  return { fallen, arrivedBy }

  function land(report: ReferenceLine, outcome: { carried: Hour[]; hoursOf: ReferenceSetting }) {
    const targetOn = report.targetOn!
    const stopDay = stoppedAt(targetOn)
    const arrival = settingAt(targetOn) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (arrival === undefined || outcome.carried.length === 0) return
    const opensRhythm = openings.delete(targetOn)
    const chosen = chosenDateOf(report, live, settingOf)
    const day = arrivedOn(into.get(targetOn), outcome, arrival, { opensRhythm, chosen })
    into.set(targetOn, day)
    const received = chosen ? hoursOf(chosen) : outcome.carried
    arrivedHours.set(targetOn, [...(arrivedHours.get(targetOn) ?? []), ...received])
    received.forEach((hour) => arrivedBy.set(keyOf(targetOn, hour), report))
  }
}
