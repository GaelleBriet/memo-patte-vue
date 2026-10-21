import { writtenBefore, type coverages, type Journey } from './reference-days'
import { hoursOf, keyOf, sameFrequency, sameHours } from './reference-grid'
import { arrivedOn, chosenDateOf, hoursChangedSince, reportOutcome } from './reference-reports'
import { chooserOf, takenByRank, wholeDayOf } from './reference-ranks'
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
  const arrivalsOnly = new Set<string>()
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
    const chooser = chooserOf(report!, settingAt, live)
    const chosenDay = chooser?.firstDueOn
    const oldArrival = chosenDay === undefined ? undefined : days.get(chosenDay)
    // G13 : son décalage a déjà fait avancer depuis la date choisie les doses qui la suivaient.
    const turned = chosenDay !== undefined && context.turnedFromChosen.has(`${dueOn}>${targetOn}`)
    if (oldArrival !== undefined || turned) {
      const from = departure ?? left.get(dueOn)
      const chosenHours = hoursOf(chooser!)
      // Q-a : sur la date choisie, c'est la dose touchée qui part, par le rang de son heure.
      const touchedHour = report!.previousTargetTime
      const touched =
        touchedHour !== undefined && touchedHour !== null && !chosenHours.includes(null)
          ? { ...report!, dueTime: touchedHour, dueRank: null }
          : undefined
      // Ce que le report emporte de sa journée de départ, si elle se lit encore, arrive aussi : son heure
      // et les suivantes (R7), ou, son heure absente, la dose de son rang (Q4).
      let leftDeparture: Hour[] = []
      if (from !== undefined && from.hours.includes(report!.dueTime)) {
        const taken = coveredAside(dueOn, from)
        const stays = (hour: Hour) =>
          taken.has(hour) || (hour !== null && hour < (report!.dueTime ?? ''))
        leftDeparture = from.hours.filter((hour) => !stays(hour))
        from.hours = from.hours.filter(stays)
      } else if (from !== undefined) {
        const atRank = takenByRank(report!, from.hours, exactAt(dueOn, from), withFollowing)
        from.hours = from.hours.filter((hour) => !atRank.lost.includes(hour))
        if (atRank.lost.length > 0) {
          leftDeparture = atRank.carried
        }
      }
      if (targetOn! > dueOn) fallen.add(dueOn)
      let carried: Hour[]
      if (turned) {
        // G13, R9 : la journée entière de la date choisie arrive ; la série repart de l'arrivée.
        carried = wholeDayOf(touched ?? report!, chosenHours)
      } else {
        // R7 : la dose touchée part avec les heures suivantes de sa journée, case ou non.
        const byRank = takenByRank(
          touched ?? report!,
          oldArrival!.hours,
          exactAt(chosenDay!, oldArrival!),
          touched !== undefined || withFollowing,
        )
        // #796 : les doses parties arrivent aux heures du réglage qui a choisi la date ; #992 : à celles
        // que le report y a vues, quand un réglage écrit après lui la lit aujourd'hui.
        const seenHours = hoursSeenBy(report!, chosenDay!, oldArrival!)
        const relaid = touched
          ? takenByRank(touched, chosenHours, new Set(), true).carried
          : seenHours
            ? takenByRank(report!, seenHours, exactAt(chosenDay!, oldArrival!), withFollowing)
                .carried
            : byRank.carried
        oldArrival!.hours = oldArrival!.hours.filter((hour) => !byRank.lost.includes(hour))
        // Lue au départ comme sur l'ancienne arrivée, c'est la même dose : elle arrive une fois.
        carried = touched || leftDeparture.length === 0 ? relaid : leftDeparture
      }
      // #796 : la journée venue de la date choisie appartient au réglage qui l'a choisie.
      const owner = turned || touched ? chooser! : settingOf(report!.settingId)
      land(report!, { carried, hoursOf: owner })
      continue
    }
    const verdict =
      rewrite === undefined
        ? undefined
        : rewrittenDeparture(report!, settingOf(report!.settingId), rewrite, departure)
    if (verdict === 'lost') continue
    const rewritten = verdict === 'read' ? undefined : verdict
    // Q4 : gagnant, le report emporte son heure ; sa journée perd la dose libre de son rang.
    let rankCarried: Hour[] = []
    if (rewritten !== undefined && departure !== undefined) {
      const byRank = takenByRank(report!, departure.hours, exactAt(dueOn, departure), withFollowing)
      departure.hours = departure.hours.filter((hour) => !byRank.lost.includes(hour))
      rankCarried = byRank.carried
    }
    const origin = rewritten ? undefined : (days.get(dueOn) ?? left.get(dueOn))
    const read = origin && withCededDoses(dueOn, origin)
    const from = origin?.setting ?? settingOf(report!.settingId)
    const hours = read?.hours ?? rewritten?.hours ?? hoursOf(from)
    if (origin === undefined) {
      notes
        .filter((note) => note.dueOn === dueOn && hours.includes(note.dueTime))
        .forEach((note) => matched.add(note))
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : coveredOn(dueOn, read!)
    // R6, TR-9 : hors de sa grille, un report est sans effet, sauf s'il porte la date choisie,
    // arrive sur la première échéance d'une origine écrite (TR-28) ou ouvre un rythme (R9.2).
    const at = settingAt(dueOn)?.id ?? ''
    const restartOn = restarts.get(at)
    const chosenOn = chosenRestarts.get(at)
    const carries = targetOn === restartOn || targetOn === chosenOn || openings.has(targetOn!)
    const before = chosenRestarts.get(report!.settingId) !== chosenOn
    const outside = (dueOn === chosenOn && before) || (!origin && verdict === undefined && !carries)
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
      day: read ?? { setting: from, hours },
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
    const carried = [...new Set([...outcome.carried, ...rankCarried])].sort()
    land(report!, { carried, hoursOf: outcome.hoursOf })
  }
  return { fallen, arrivedBy }

  // R4, R7 : faite des seules doses arrivées, la journée où un réglage cède la place garde aussi les siennes.
  function withCededDoses(day: string, origin: Journey): Journey {
    const ceded = arrivalsOnly.has(day) ? left.get(day) : undefined
    if (ceded === undefined) return origin
    return {
      setting: origin.setting,
      hours: [...new Set([...origin.hours, ...ceded.hours])].sort(),
    }
  }

  function hoursSeenBy(report: ReferenceLine, day: string, journey: Journey): Hour[] | undefined {
    if (journey.setting.createdAt <= report.updatedAt) return undefined
    let seen: ReferenceSetting | undefined
    for (const setting of live) {
      if (setting.startsOn <= day && setting.createdAt <= report.updatedAt) seen = setting
    }
    if (seen === undefined || sameHours(seen, journey.setting)) return undefined
    return hoursOf(seen)
  }

  // Q4 : seule une prise posée à l'heure même d'une dose en garde le rang.
  function exactAt(day: string, journey: Journey): Set<Hour> {
    const atHour = notes.filter(
      (note) => note.dueOn === day && journey.hours.includes(note.dueTime),
    )
    return new Set(atHour.map(({ dueTime }) => dueTime))
  }

  function land(report: ReferenceLine, outcome: { carried: Hour[]; hoursOf: ReferenceSetting }) {
    const targetOn = report.targetOn!
    const stopDay = stoppedAt(targetOn)
    const arrival = settingAt(targetOn) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (arrival === undefined || outcome.carried.length === 0) return
    const opensRhythm = openings.delete(targetOn)
    // R4 : à fréquence gardée, le jour où les heures changent, la date choisie prend les nouvelles heures.
    const picker = chosenDateOf(report, live, settingOf)
    const relaid = picker && translated.has(targetOn) && sameFrequency(arrival, picker)
    const chosen = relaid ? arrival : picker
    if (into === days && !days.has(targetOn)) arrivalsOnly.add(targetOn)
    const day = arrivedOn(into.get(targetOn), outcome, arrival, { opensRhythm, chosen })
    into.set(targetOn, day)
    const received = chosen ? hoursOf(chosen) : outcome.carried
    const seen = relaid ? [] : received
    arrivedHours.set(targetOn, [...(arrivedHours.get(targetOn) ?? []), ...seen])
    received.forEach((hour) => arrivedBy.set(keyOf(targetOn, hour), report))
  }
}
