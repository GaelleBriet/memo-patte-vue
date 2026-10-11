import {
  applied,
  moveDose,
  noteDose,
  redateDose,
  removeLine,
  viewInputOf,
  type GestureResult,
  type Line,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import type { Due } from '@/shared/domain/treatment-schedule'

import type { Book } from './carnet'
import { keptBook, type Walk } from './walk-state'

export const v2Due = ({ periodId, dueOn, dueTime }: Due) => ({
  settingId: periodId,
  dueOn,
  dueTime,
})

const signature = (lines: readonly Line[]) =>
  lines
    .map(({ settingId, dueOn, dueTime, status, givenOn, targetOn }) =>
      JSON.stringify([settingId, dueOn, dueTime, status, givenOn, targetOn]),
    )
    .sort()

// La règle qui sépare les deux carnets, d'après les lignes que l'un écrit et pas l'autre.
function differenceOf(mine: string[], target: string[]): string {
  const statuses = [
    ...mine.filter((line) => !target.includes(line)),
    ...target.filter((line) => !mine.includes(line)),
  ].map((line) => (JSON.parse(line) as string[])[3])
  if (statuses.includes('extra')) return 'v2 écrit autre chose (R5, prise en plus)'
  if (statuses.includes('postponed')) return 'v2 écrit autre chose (R7, report)'
  if (statuses.every((status) => status === 'shift')) return 'v2 écrit autre chose (R6, décalage)'
  return 'v2 écrit autre chose (prise)'
}

export type V2Play = (input: TreatmentViewInput) => GestureResult

/**
 * L'oracle ne compare que des carnets que l'app peut produire : un geste du moteur actuel n'est joué
 * que si le moteur v2, pour le même geste (case cochée ou non), écrit le même carnet. Sinon il est
 * compté avec sa raison (refus de v2, ou autres lignes) et le carnet reste tel quel.
 */
export function refusedByV2(walk: Walk, gesture: string, after: Book, plays: V2Play[]): boolean {
  if (walk.filter === 'aucun') return false
  const input = viewInputOf(keptBook(walk))
  const target = signature(viewInputOf({ ...after, doses: [...after.doses, ...walk.purged] }).lines)
  const reasons: string[] = []
  for (const play of plays) {
    let result: GestureResult
    try {
      result = play(input)
    } catch (error) {
      reasons.push(`v2 lève (${String(error).slice(0, 60)})`)
      continue
    }
    if ('refusal' in result) {
      reasons.push(result.refusal.reason)
      continue
    }
    const mine = signature(applied(input, result.changes).lines)
    if (mine.join() === target.join()) return false
    reasons.push(differenceOf(mine, target))
  }
  walk.refused.push({ gesture, reason: reasons[0] ?? 'aucun geste v2' })
  return true
}

export const v2 = { moveDose, noteDose, redateDose, removeLine }

/** Le geste v2 joué case cochée, puis décochée. */
export const bothBoxes = (play: (shiftsFollowing: boolean) => V2Play): V2Play[] => [
  play(true),
  play(false),
]
