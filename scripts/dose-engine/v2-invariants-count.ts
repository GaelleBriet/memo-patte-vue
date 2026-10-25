import {
  treatmentView,
  type Day,
  type LineChange,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { firstDayOf, horizonOf, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

const isReport = (input: TreatmentViewInput, id: string) =>
  input.lines.some((line) => line.id === id && line.status === 'postponed')

// Limite connue : un décalage écrit ou supprimé translate la suite, que ce compte ne sait pas aligner.
const touchesShift = (input: TreatmentViewInput, change: LineChange) =>
  change.action === 'delete'
    ? input.lines.some((line) => line.id === change.id && line.status === 'shift')
    : change.line.status === 'shift'

function touchedDays({ before, gesture, outcome }: V2Step): Day[] {
  const days: Day[] = gesture?.kind === 'move' ? [gesture.due.dueOn, gesture.to] : []
  const daysOf = (line: { dueOn: Day; targetOn: Day | null }) =>
    line.targetOn === null ? [line.dueOn] : [line.dueOn, line.targetOn]
  for (const change of outcome?.changes ?? ([] as LineChange[])) {
    if (change.action !== 'create') {
      const line = before.lines.find(({ id }) => id === change.id)
      if (line !== undefined) days.push(...daysOf(line))
    }
    if (change.action !== 'delete') days.push(...daysOf(change.line))
  }
  return days
}

// Jusqu'à la première journée après les jours touchés comprise : un décalage ne fait que translater la suite.
function toGive(input: TreatmentViewInput, cut: Day): number {
  const until = [horizonOf(input), plusDays(cut, 400)].sort().at(-1)!
  const slots = treatmentView(input).slots(firstDayOf(input), until)
  const next = slots.find(({ due }) => due.dueOn > cut)?.due.dueOn
  return slots.filter(
    ({ due, state }) => state === 'pending' && (next === undefined || due.dueOn <= next),
  ).length
}

/**
 * R7, R11, Q51 : un déplacement ou la suppression d'un report ne fait pas monter le nombre de doses
 * à donner, hors celles qu'il rend à renseigner ou en retard (G21) ; jugé sans décalage touché.
 */
export function noDoseAdded(step: V2Step): Broken | null {
  const { before, after, gesture, outcome } = step
  if (outcome === null || (gesture?.kind !== 'move' && gesture?.kind !== 'remove')) return null
  if (gesture.kind === 'remove' && !isReport(before, gesture.lineId)) return null
  if (outcome.changes.some((change) => touchesShift(before, change))) return null
  const days = touchedDays(step)
  if (days.length === 0) return null
  const cut = days.sort().at(-1)!
  const [was, now] = [toGive(before, cut), toGive(after, cut)]
  if (now <= was + outcome.newlyDue.length) return null
  return {
    invariant: 'doses à donner',
    detail: `jusqu'à la journée après le ${cut} : ${was} avant, ${now} après (${outcome.newlyDue.length} rendues à renseigner)`,
  }
}
