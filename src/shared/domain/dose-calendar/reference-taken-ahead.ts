import { hoursOf, isOnGrid, sameFrequency, type Hour } from './reference-grid'
import { latestBy, reportsOf } from './reference-lines'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/**
 * Q76 : une journée avancée avec la case puis prise a eu lieu le jour de sa prise. Quand un réglage
 * écrit après elle change la fréquence de son rythme, le nouveau rythme repart de ce jour-là : une de
 * ses échéances est neuve, les lignes de cette journée écrites avant lui ne la couvrent ni ne la déplacent.
 */
export function pastLinesOf(
  own: readonly ReferenceLine[],
  live: readonly ReferenceSetting[],
  settingOf: (id: string) => ReferenceSetting,
): Set<ReferenceLine> {
  const past = new Set<ReferenceLine>()
  live.forEach((setting, index) => {
    const previous = live[index - 1]
    if (previous === undefined || sameFrequency(previous, setting)) return
    const next = live.slice(index + 1).find((each) => !sameFrequency(each, setting))
    const run = live.slice(index, next === undefined ? undefined : live.indexOf(next))
    // R3 : une échéance du nouveau rythme, sur la grille de son dernier réglage qui l'a fait repartir.
    const isNewDue = (day: string) => {
      const reading = run.filter(({ startsOn }) => startsOn <= day)
      if (reading.length === 0) return false
      const grid =
        [...reading].reverse().find(({ gridOriginOn }) => gridOriginOn !== null) ?? setting
      return (
        day >= grid.firstDueOn &&
        isOnGrid(grid.gridOriginOn ?? grid.firstDueOn, setting.frequency, day)
      )
    }
    const written = own.filter(({ decidedAt }) => decidedAt < setting.createdAt)
    const advances = latestBy(
      written.filter(({ status, targetOn }) => status === 'shift' && targetOn !== null),
      ({ dueOn }) => dueOn,
    )
    for (const advance of advances) {
      const day = advance.dueOn
      const realDay = advance.targetOn!
      if (!isNewDue(day) || realDay >= day || realDay > setting.startsOn) continue
      if (sameFrequency(settingOf(advance.settingId), setting)) continue
      const takenAhead = written.filter(
        (line) => line.dueOn === day && line.status === 'given' && (line.givenOn ?? day) < day,
      )
      const takenDay = (arrival: string | null) =>
        arrival !== null &&
        arrival < day &&
        own.some(({ status, dueOn }) => status === 'given' && dueOn === arrival)
      const movedToATakenDay = written.filter(
        (line) => line.dueOn === day && line.status === 'postponed' && takenDay(line.targetOn),
      )
      if (takenAhead.length === 0 && movedToATakenDay.length === 0) continue
      ;[advance, ...takenAhead, ...movedToATakenDay].forEach((line) => past.add(line))
    }
  })
  return past
}

/** R7 : le report qui a eu lieu garde son arrivée, avec les doses de sa journée qui n'y ont pas été données d'avance. */
export function pastArrivals(
  past: ReadonlySet<ReferenceLine>,
  settingOf: (id: string) => ReferenceSetting,
): { report: ReferenceLine; carried: Hour[] }[] {
  const givenAhead = [...past].filter(({ status }) => status === 'given')
  return reportsOf([...past]).map((report) => ({
    report,
    carried: hoursOf(settingOf(report.settingId)).filter(
      (hour) =>
        (hour === null || hour >= (report.dueTime ?? '')) &&
        !givenAhead.some(({ dueOn, dueTime }) => dueOn === report.dueOn && dueTime === hour),
    ),
  }))
}
