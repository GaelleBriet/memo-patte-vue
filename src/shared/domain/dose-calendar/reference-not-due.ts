import type { ReferenceLine } from './reference-types'

type Hour = string | null

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
