import type { Slot } from './calendar'
import { keyOf } from './grid'
import type { EpisodeLines } from './lines'
import type { Day, Line, LineEffect } from './types'

// R4 : une prise donnée qui ne couvre aucune échéance de sa journée garde sa propre échéance ;
// au-delà de l'arrêt, la reprise seule porte ces jours (R8).
export function keepGivenNotes(
  notes: readonly Line[],
  slots: readonly Slot[],
  held: Map<Line, string>,
  { yielded, closedFrom }: { yielded: ReadonlySet<string>; closedFrom: Day | null },
): void {
  const placed = new Set(slots.map(({ coveredBy }) => coveredBy))
  for (const note of notes) {
    const key = keyOf(note.dueOn, note.dueTime)
    if (note.status !== 'given' || placed.has(note) || held.has(note) || yielded.has(key)) continue
    if (closedFrom === null || note.dueOn < closedFrom) held.set(note, key)
  }
}

// R4, #847 : laissée avant une première échéance posée plus loin, une journée qui porte une prise
// donnée lit les heures de ses prises : chacune, oubli compris, y garde la sienne.
export function keepSkippedDays(
  notes: readonly Line[],
  skipped: ReadonlySet<Day>,
  slots: readonly Slot[],
  held: Map<Line, string>,
): void {
  const placed = new Set(slots.map(({ coveredBy }) => coveredBy))
  const free = (note: Line) => skipped.has(note.dueOn) && !placed.has(note) && !held.has(note)
  const days = new Set(
    notes.filter((note) => note.status === 'given' && free(note)).map(({ dueOn }) => dueOn),
  )
  for (const note of notes) {
    if (days.has(note.dueOn) && free(note)) held.set(note, keyOf(note.dueOn, note.dueTime))
  }
}

export function noteEffects(
  lines: EpisodeLines,
  borrowed: readonly Line[],
  slots: readonly Slot[],
  held: ReadonlyMap<Line, string>,
  effects: Map<string, LineEffect>,
): void {
  const covering = new Map<Line, string>()
  for (const { coveredBy, key } of slots) {
    if (coveredBy !== null && !covering.has(coveredBy)) covering.set(coveredBy, key)
  }
  for (const note of [...lines.notes, ...borrowed]) {
    const key = covering.get(note)
    if (borrowed.includes(note) && key === undefined) continue
    const covered = key ?? held.get(note)
    effects.set(
      note.id,
      covered === undefined
        ? { kind: 'idle', reason: 'nothing-to-cover' }
        : { kind: 'covers', key: covered },
    )
  }
  for (const line of lines.kept) {
    if (line.status === 'extra') effects.set(line.id, { kind: 'extra' })
  }
  lines.idle.forEach((reason, id) => effects.set(id, { kind: 'idle', reason }))
}
