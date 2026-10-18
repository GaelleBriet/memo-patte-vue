import { coverages, type Journey, type ReferenceDue } from './reference-days'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

type Hour = string | null

const isTaken = (line: ReferenceLine) => line.status === 'given' || line.status === 'missed'

const keyOf = (day: string, hour: Hour) => (hour === null ? day : `${day} ${hour}`)
const newer = (a: ReferenceLine, b: ReferenceLine) =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

/** Les heures d'une journée qui restent des échéances : couvertes par une prise, ou pas couvertes du tout. */
export const existingHours = (
  hours: readonly Hour[],
  covered: ReadonlySet<Hour>,
  coveredByTaken: ReadonlySet<Hour>,
): Hour[] => hours.filter((hour) => !covered.has(hour) || coveredByTaken.has(hour))

/** Une ligne « pas à donner » posée sur l'arrivée d'un report plus récent qu'elle ne compte pas. */
export const beatenNotDue = (
  notes: readonly ReferenceLine[],
  arrivedBy: ReadonlyMap<string, ReferenceLine>,
): Set<ReferenceLine> =>
  new Set(
    notes.filter((note) => {
      const report = arrivedBy.get(keyOf(note.dueOn, note.dueTime))
      return note.status === 'not-due' && report !== undefined && newer(report, note)
    }),
  )

/** Une ligne « pas à donner » sur la dose qu'un report plus récent déplace ne compte pas. */
export const departureBeaten = (
  notes: readonly ReferenceLine[],
  reports: readonly ReferenceLine[],
): Set<ReferenceLine> =>
  new Set(
    notes.filter(
      (note) =>
        note.status === 'not-due' &&
        reports.some(
          (report) =>
            report.dueOn === note.dueOn && report.dueTime === note.dueTime && newer(report, note),
        ),
    ),
  )

/** Une journée sans prise listée en entier, dont aucune heure n'est plus celle d'une de ses lignes. */
export const listedWholeDay = (
  day: string,
  hours: readonly Hour[],
  notes: readonly ReferenceLine[],
  beaten: ReadonlySet<ReferenceLine>,
): boolean => {
  const ofDay = notes.filter((note) => note.dueOn === day && !beaten.has(note))
  return (
    ofDay.length > 0 &&
    ofDay.every((note) => note.status === 'not-due' && !hours.includes(note.dueTime))
  )
}

type CoverageInput = {
  notes: readonly ReferenceLine[]
  borrowed: readonly ReferenceLine[]
  reports: readonly ReferenceLine[]
  translated: ReadonlySet<string>
  settingOf: (id: string) => ReferenceSetting
  arrivedBy: ReadonlyMap<string, ReferenceLine>
}

/** Les échéances des journées du calendrier, sans celles que les lignes « pas à donner » retirent (#873). */
export function duesOf(
  days: ReadonlyMap<string, Journey>,
  fallen: Set<string>,
  coveredOn: (day: string, journey: Journey) => ReadonlySet<Hour>,
  { arrivedBy, ...input }: CoverageInput,
): ReferenceDue[] {
  const { notes } = input
  const takenOn = coverages({ ...input, notes: notes.filter(isTaken) }).coveredAside
  const beaten = beatenNotDue(notes, arrivedBy)
  const standing = coverages({
    ...input,
    notes: notes.filter((note) => !beaten.has(note)),
  }).coveredAside
  const dues: ReferenceDue[] = []
  for (const [day, journey] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (listedWholeDay(day, journey.hours, notes, beaten)) continue
    const covered = beaten.size > 0 ? standing(day, journey) : coveredOn(day, journey)
    // Une échéance que seule une ligne « pas à donner » couvre n'existe pas.
    const hours = existingHours(journey.hours, covered, takenOn(day, journey))
    if (hours.length > 0) fallen.add(day)
    dues.push(...hours.map((hour) => ({ key: keyOf(day, hour), day, covered: covered.has(hour) })))
  }
  return dues
}
