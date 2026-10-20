import type { DayCoverage } from './calendar-coverage'
import type { notDueArrivals } from './calendar-not-due'
import { hoursOf, keyOf, sameHours } from './grid'
import type { Journey, journeys } from './journeys'
import type { EpisodeLines } from './lines'
import { chosenOldArrival, rankedMove } from './report-rank'
import { departureVerdict } from './rewrite'
import type { Span } from './settings'
import type { Day, Hour, Line, LineEffect, Setting } from './types'

/** Ce que la passe des reports lit du calendrier en cours de construction. */
export type ReportsInput = {
  span: Span
  lines: EpisodeLines
  settingOf: (id: string) => Setting
  journey: ReturnType<typeof journeys>
  effects: Map<string, LineEffect>
  notDue: ReturnType<typeof notDueArrivals>
  coveredOn: DayCoverage
  noted: ReadonlySet<string>
  byDay: ReadonlyMap<Day, Line[]>
  isBorrowed: ReadonlySet<Line>
  matched: Set<Line>
  held: Map<Line, string>
}

/** R7 : chaque report part de sa journée et arrive sur la sienne ; ceux qui arrivent sur sa journée d'abord. */
export function moveReports(input: ReportsInput) {
  const { span, lines, settingOf, journey, effects, notDue, coveredOn, noted, byDay } = input
  const { isBorrowed, matched, held } = input
  const { days, translated, left, openings, restarts, chosenRestarts } = journey
  // R7 : un report emporte son heure et les suivantes encore sans prise ; les reports qui arrivent
  // sur sa journée passent d'abord.
  const fallen = new Set<Day>()
  const moved = new Map<string, Line>()
  const arrived = new Map<Day, Hour[]>()
  const waiting = [...lines.reports]
  while (waiting.length > 0) {
    const ready = waiting.findIndex(
      (report) => !waiting.some((other) => other.targetOn === report.dueOn),
    )
    const report = waiting.splice(Math.max(0, ready), 1)[0]!
    const { dueOn, dueTime, targetOn } = report
    const departure = days.get(dueOn)
    const after = (hour: Hour) => hour === null || hour >= (dueTime ?? '')
    const withFollowing = lines.shifts.some((shift) => shift.dueOn === dueOn)
    // Q1 : sur la date choisie qui portait sa dose, le report reprend sa dose par son rang ; ce qu'il
    // emporte de sa journée de départ, quand elle se lit encore, arrive avec elle.
    const oldOn = chosenOldArrival(report, span)
    const oldDay = oldOn === undefined ? undefined : days.get(oldOn)
    if (oldDay !== undefined) {
      const gone = departure === undefined ? [] : leaveFrom(dueOn, departure, after)
      const noted = new Set(coveredOn(oldOn!, oldDay, new Set()).keys())
      const { leaving: ranked, carried } = rankedMove(report, oldDay.hours, noted, withFollowing)
      // G13 : son décalage a déjà fait avancer les journées suivantes jusqu'à l'ancienne arrivée.
      const turned = lines.shifts.some(
        (shift) =>
          shift.dueOn === dueOn &&
          shift.targetOn === targetOn &&
          effects.get(shift.id)?.kind === 'shifts',
      )
      const leaving = turned ? [] : ranked
      oldDay.hours = oldDay.hours.filter((hour) => !leaving.includes(hour))
      const keys = [
        ...gone.map((hour) => keyOf(dueOn, hour)),
        ...leaving.map((hour) => keyOf(oldOn!, hour)),
      ]
      keys.forEach((key) => moved.set(key, report))
      if (targetOn! > dueOn) fallen.add(dueOn)
      const bringing = [...new Set([...gone, ...carried])].sort()
      arrive(report, keys, bringing, settingOf(report.settingId))
      continue
    }
    const verdict = departureVerdict(report, {
      departure,
      arrived: arrived.get(dueOn) ?? [],
      written: settingOf(report.settingId),
      reading: span.settingAt(dueOn),
      drawnBy: journey.drawnBy.get(span.settingAt(dueOn)?.id ?? ''),
    })
    const rewrite = verdict === 'kept' ? null : verdict
    const origin = rewrite === null ? (days.get(dueOn) ?? left.get(dueOn)) : undefined
    const from = origin?.setting ?? settingOf(report.settingId)
    if (rewrite === 'rewrite') {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      continue
    }
    // #867 : plus récent que la réécriture de son réglage, le report n'emporte que l'heure qu'il porte ;
    // Q4 : sa journée de départ perd la dose de son rang, et les suivantes avec la case.
    const hours = rewrite === 'line' ? [dueTime] : (origin?.hours ?? hoursOf(from.times))
    let ranked: Hour[] | undefined
    if (rewrite === 'line' && departure !== undefined) {
      const noted = new Set(coveredOn(dueOn, departure, new Set()).keys())
      const { leaving, carried } = rankedMove(report, departure.hours, noted, withFollowing)
      departure.hours = departure.hours.filter((hour) => !leaving.includes(hour))
      leaving.forEach((hour) => moved.set(keyOf(dueOn, hour), report))
      ranked = carried
    }
    // R8 : au-delà de l'arrêt, une prise ne garde pas son échéance, la reprise seule la porte.
    if (origin === undefined && (span.closedFrom === null || dueOn < span.closedFrom)) {
      for (const note of byDay.get(dueOn) ?? []) {
        if (!isBorrowed.has(note) && hours.includes(note.dueTime)) {
          matched.add(note)
          held.set(note, keyOf(note.dueOn, note.dueTime))
        }
      }
    }
    // R6, TR-9 : hors de sa grille, un report est sans effet, sauf s'il porte la date choisie,
    // arrive sur la première échéance d'une origine écrite (TR-28) ou ouvre un rythme (R9.2).
    const at = span.settingAt(dueOn)?.id ?? ''
    const restartOn = restarts.get(at)
    const chosenOn = chosenRestarts.get(at)
    const carries = targetOn === restartOn || targetOn === chosenOn || openings.has(targetOn!)
    const carried =
      chosenOn !== undefined &&
      dueOn === chosenOn &&
      chosenRestarts.get(report.settingId) !== chosenOn
    const outside = origin === undefined && verdict === null
    if (carried || (chosenOn !== undefined && outside && !carries)) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      continue
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : new Set(coveredOn(dueOn, origin).keys())
    const written = settingOf(report.settingId)
    // R4, R7 : le jour où les heures changent, écrit sous d'autres heures ou avant un changement d'heures
    // de sa journée, un report se juge sur ses prises et le jour de départ perd autant qu'il emporte.
    const relit =
      from.id === span.settingAt(dueOn)?.id &&
      written.id !== from.id &&
      span.live.some(
        (each) =>
          each.startsOn === dueOn &&
          each.createdAt > written.createdAt &&
          !sameHours(each, written),
      )
    const reread = translated.has(dueOn) && (!sameHours(written, from) || relit)
    const source = reread ? written : from
    // R7 : la journée d'un report, telle qu'il l'a vue, porte aussi les doses qui y sont arrivées (#864).
    const writtenHours = [
      ...new Set([...hoursOf(written.times), ...(arrived.get(dueOn) ?? [])]),
    ].sort()
    const writtenBefore = (note: Line) => settingOf(note.settingId).createdAt <= written.createdAt
    // R4, R7, #860 : le report garde ses heures ; une prise d'un réglage écrit avant le sien, d'une heure
    // absente, s'y pose avant lui ; une prise des heures écrites après ne compte qu'à son heure.
    const ownNoted = new Set(
      coveredOn(dueOn, { setting: written, hours: writtenHours }, new Set(), writtenBefore).keys(),
    )
    if (source === from ? covered.has(dueTime) : ownNoted.has(dueTime)) {
      effects.set(report.id, { kind: 'idle', reason: 'beaten' })
      continue
    }
    if (targetOn! > dueOn) fallen.add(dueOn)
    const free = hours.filter((hour) => !covered.has(hour))
    const following = free.filter(after)
    const bringing =
      ranked ??
      (source === from
        ? following
        : writtenHours.filter((hour) => after(hour) && !ownNoted.has(hour)))
    // R4, R7 : relu aux nouvelles heures, le jour de départ garde les doses que le report a laissées : celles
    // d'avant lui et celles d'après déjà notées ; les prises écrites après lui s'y posent ensuite.
    const notedAfter = writtenHours.filter((hour) => after(hour) && ownNoted.has(hour)).length
    const rank = writtenHours.filter((hour) => !after(hour)).length
    const stays = Math.max(0, rank + notedAfter - covered.size)
    const leaving = source === from ? following : free.slice(stays)
    if (origin !== undefined) origin.hours = origin.hours.filter((hour) => !leaving.includes(hour))
    const keys = bringing.map((hour) => keyOf(dueOn, hour))
    for (const key of [...leaving.map((hour) => keyOf(dueOn, hour)), ...keys])
      moved.set(key, report)
    arrive(report, keys, bringing, source)
  }

  // R7 : le jour d'arrivée ne reçoit que les heures reportées, telles qu'elles étaient au départ ;
  // la date choisie qui emmène le report (#796) reçoit la journée entière de son réglage.
  function arrive(report: Line, keys: string[], bringing: Hour[], source: Setting) {
    const { targetOn } = report
    const stopDay = span.stoppedAt(targetOn!)
    const arrival = span.settingAt(targetOn!) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (bringing.length === 0) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      return
    }
    effects.set(report.id, {
      kind: 'moves',
      keys,
      arrival: arrival === undefined ? null : targetOn,
    })
    if (arrival === undefined) return
    const chosen = lines.chosenArrivals.get(report)
    const under = chosen ?? source
    const own = sameHours(arrival, under) ? arrival : under
    const arriving = chosen ? hoursOf(chosen.times) : bringing
    notDue.arrive(report, targetOn!, arriving)
    const day = into.get(targetOn!) ?? { setting: own, hours: [] }
    // R7, R9.2 : un nouveau rythme qui part du jour d'arrivée d'un report lui laisse ses seules heures.
    if (openings.delete(targetOn!)) {
      day.hours = []
      effects.set(report.id, { kind: 'moves', keys, arrival: targetOn, opensRhythm: true })
    }
    if (day.hours.length === 0) day.setting = own
    // R7 : une journée d'échéance garde ses doses et y ajoute celles qui arrivent, une heure une fois.
    day.hours = [...new Set([...day.hours, ...arriving])].sort()
    into.set(targetOn!, day)
    arrived.set(targetOn!, [...(arrived.get(targetOn!) ?? []), ...arriving])
  }

  // R7 : un report quitte sa journée avec son heure et les suivantes encore sans prise.
  function leaveFrom(day: Day, journey: Journey, after: (hour: Hour) => boolean): Hour[] {
    const noted = coveredOn(day, journey, new Set())
    const gone = journey.hours.filter((hour) => !noted.has(hour) && after(hour))
    journey.hours = journey.hours.filter((hour) => !gone.includes(hour))
    return gone
  }

  return { fallen, moved }
}
