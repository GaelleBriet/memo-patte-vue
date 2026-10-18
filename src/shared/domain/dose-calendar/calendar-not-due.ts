import { keyOf } from './grid'
import { reportBeats } from './lines'
import type { Day, Hour, Line, LineEffect } from './types'

/**
 * #873 : les arrivées des reports, et ce que les lignes « pas à donner » en font : entre un report et
 * celles de son arrivée, le plus récent l'emporte ; le perdant est sans effet.
 */
export function notDueArrivals(effects: Map<string, LineEffect>) {
  const arrivedBy = new Map<string, Line>()
  const removedOf = new Map<Line, number>()
  const beaten = new Set<Line>()
  return {
    arrive(report: Line, day: Day, hours: readonly Hour[]) {
      for (const hour of hours) arrivedBy.set(keyOf(day, hour), report)
    },
    // C2 : une journée sans prise sort en entier si ses heures ont changé depuis ses lignes « pas à
    // donner », sinon heure par heure ; une ligne battue ne couvre plus rien.
    hoursOf(
      day: Day,
      hours: readonly Hour[],
      covered: Map<Hour, Line>,
      held: Map<Line, string>,
      dayNotes: readonly Line[],
    ) {
      const standing = (note: Line) => {
        const report = arrivedBy.get(keyOf(note.dueOn, note.dueTime))
        return report === undefined || !reportBeats(report, note)
      }
      if (
        dayNotes.length > 0 &&
        dayNotes.every((note) => note.status === 'not-due' && standing(note)) &&
        !dayNotes.some((note) => hours.includes(note.dueTime))
      ) {
        dayNotes.forEach((note) => held.set(note, keyOf(note.dueOn, note.dueTime)))
        for (const [key, report] of arrivedBy) {
          if (key.slice(0, 10) === day) removedOf.set(report, (removedOf.get(report) ?? 0) + 1)
        }
        return []
      }
      return hours.filter((hour) => {
        const note = covered.get(hour)
        if (note?.status !== 'not-due') return true
        const report = arrivedBy.get(keyOf(day, hour))
        if (report !== undefined && reportBeats(report, note)) {
          beaten.add(note)
          covered.delete(hour)
          return true
        }
        held.set(note, keyOf(day, hour))
        if (report !== undefined) removedOf.set(report, (removedOf.get(report) ?? 0) + 1)
        return false
      })
    },
    settle() {
      const arrivals = new Map<Line, number>()
      for (const report of arrivedBy.values()) arrivals.set(report, (arrivals.get(report) ?? 0) + 1)
      removedOf.forEach((count, report) => {
        if (count === arrivals.get(report)) {
          effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
        }
      })
      for (const note of beaten) effects.set(note.id, { kind: 'idle', reason: 'beaten' })
    },
  }
}
