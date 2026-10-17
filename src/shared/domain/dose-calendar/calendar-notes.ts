import type { Slot } from './calendar'
import { keyOf, stepped } from './grid'
import type { EpisodeLines } from './lines'
import type { Day, Line, LineEffect, Setting } from './types'

// R4 : une prise donnée dont l'échéance a quitté le calendrier couvre la première échéance qui suit,
// à moins d'un pas de son réglage ; un oubli ne couvre que sa propre échéance.
export function coverOrphans(
  notes: readonly Line[],
  matched: ReadonlySet<Line>,
  slots: Slot[],
  settingOf: (id: string) => Setting,
): void {
  const orphans = notes
    .filter((note) => note.status === 'given' && !matched.has(note))
    .sort((a, b) => keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)))
  for (const note of orphans) {
    const own = keyOf(note.dueOn, note.dueTime)
    const slot = slots.find(({ key }) => key > own)
    const limit = stepped(note.dueOn, settingOf(note.settingId).frequency, 1)
    if (slot !== undefined && slot.coveredBy === null && slot.due.dueOn < limit) {
      slot.coveredBy = note
    }
  }
}

/**
 * R4, #847 : une journée de la grille laissée avant une première échéance posée plus loin, dont une
 * prise donnée ne couvre aucune échéance qui la suit, lit les heures de ses prises : chacune y garde la sienne.
 */
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
