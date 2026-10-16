import { hoursOf, sameHours } from './grid'
import type { Journey } from './journeys'
import { isMoreRecent } from './lines'
import type { Day, Hour, Line, Setting } from './types'

export type CoverageInput = {
  notes: readonly Line[]
  borrowed: readonly Line[]
  reports: readonly Line[]
  translated: ReadonlySet<Day>
  settingOf: (id: string) => Setting
  matched: Set<Line>
}

export type DayCoverage = (
  day: Day,
  journey: Journey,
  read?: Set<Line>,
  placeable?: (note: Line) => boolean,
) => Map<Hour, Line>

/**
 * R4 : une prise couvre son échéance quel que soit son réglage, sinon la première échéance libre qui
 * la suit ; une journée de l'ancien réglage toute notée, ou une prise d'avant l'arrêt (R8), couvre
 * tout. Le jour où les heures changent, une prise écrite après le report du jour attend `settle()` et
 * ne se pose que sur les heures qu'il a laissées.
 */
export function dayCoverage(input: CoverageInput): { coveredOn: DayCoverage; settle: () => void } {
  const { borrowed, translated, settingOf, matched } = input
  const byDay = new Map<Day, Line[]>()
  for (const note of input.notes) byDay.set(note.dueOn, [...(byDay.get(note.dueOn) ?? []), note])
  const isBorrowed = new Set(borrowed)
  const isLent = (note: Line) => isBorrowed.has(note) && note.status === 'given'
  const reportOn = new Map(
    input.reports.filter(({ dueOn }) => translated.has(dueOn)).map((each) => [each.dueOn, each]),
  )
  const isLate = (note: Line) => {
    const report = reportOn.get(note.dueOn)
    return report !== undefined && !isBorrowed.has(note) && isMoreRecent(note, report)
  }
  let reportsRead = false

  const coveredOn: DayCoverage = (day, journey, read = matched, placeable) => {
    const ofDay = byDay.get(day) ?? []
    const foreign = (note: Line) =>
      !isBorrowed.has(note) &&
      translated.has(day) &&
      !sameHours(settingOf(note.settingId), journey.setting)
    const translates = (note: Line) => foreign(note) && !isLate(note)
    const covered = new Map<Hour, Line>()
    // TR-25 : la plus récente des prises d'une heure la couvre.
    const atHour = new Map<Hour, Line>()
    for (const hour of journey.hours) {
      const note = ofDay
        .filter(({ dueTime }) => dueTime === hour)
        .reduce<Line | undefined>(
          (kept, each) => (kept && !isMoreRecent(each, kept) ? kept : each),
          undefined,
        )
      if (note !== undefined) atHour.set(hour, note)
    }
    const used = new Set(atHour.values())
    const elsewhere = ofDay
      .filter(
        (note) =>
          !used.has(note) &&
          (placeable?.(note) ?? true) &&
          (reportsRead || !isLate(note)) &&
          (note.status === 'given' || foreign(note)),
      )
      .sort(byTime)
    // R4 : une prise écrite après le report ne cherche la suivante que si le report n'a laissé aucune heure.
    const kept = (note: Line) =>
      translates(note) || (foreign(note) && reportsRead && journey.hours.length > 0)
    for (const note of ofDay) {
      if (kept(note) || journey.hours.includes(note.dueTime)) read.add(note)
    }
    // R4, #866 : le jour où les heures changent, plus de notes que d'heures : les prises données
    // prennent les heures d'abord, les oublis ensuite.
    const crowded = translated.has(day) && atHour.size + elsewhere.length > journey.hours.length
    const rounds = crowded ? [isGiven, (note: Line) => !isGiven(note)] : [() => true]
    for (const round of rounds) {
      atHour.forEach((note, hour) => {
        if (round(note) && !covered.has(hour)) covered.set(hour, note)
      })
      for (const note of elsewhere.filter(round)) {
        const free = journey.hours.filter((each) => !covered.has(each))
        // R4 : le jour où les heures changent, les prises du jour couvrent les premières heures, dans
        // l'ordre, quelle que soit leur heure ; un autre jour, la première échéance libre qui suit.
        const hour = foreign(note)
          ? free[0]
          : free.find((each) => each !== null && follows(each, note.dueTime))
        if (hour === undefined) continue
        covered.set(hour, note)
        read.add(note)
      }
    }
    const last =
      elsewhere.filter(translates).sort(byTime).at(-1) ??
      ofDay.filter(translates).sort(byTime).at(-1) ??
      ofDay.find(isLent)
    const whole =
      ofDay.some(isLent) ||
      ofDay.some(
        (note) =>
          placeable === undefined &&
          translates(note) &&
          hoursOf(settingOf(note.settingId).times).every((hour) =>
            ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
          ),
      )
    for (const hour of journey.hours.filter((each) => !covered.has(each))) {
      if (whole && last !== undefined) covered.set(hour, last)
    }
    return covered
  }
  return { coveredOn, settle: () => (reportsRead = true) }
}

const isGiven = (note: Line) => note.status === 'given'

const byTime = (a: Line, b: Line) =>
  (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || a.id.localeCompare(b.id)

const follows = (hour: Hour, after: Hour) => hour === null || after === null || hour > after
