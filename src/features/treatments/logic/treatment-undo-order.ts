import { doseFieldsOf } from './treatment-dose-writes'
import type { DoseWrite } from '../schema/treatment-dose.schema'
import type { Line } from '@/shared/domain/dose-calendar'

/**
 * TR-25 : rang de chaque ligne, de la moins à la plus récemment modifiée ; « Annuler » les date dans
 * cet ordre pour que la ligne en vigueur avant le geste le soit de nouveau. Même instant, même rang.
 */
export function undoRanks(
  lines: readonly { id: string; updatedAt: string }[],
): (id: string) => number {
  const stamps = [...new Set(lines.map(({ updatedAt }) => updatedAt))].sort()
  const byId = new Map(lines.map(({ id, updatedAt }) => [id, stamps.indexOf(updatedAt)]))
  return (id) => byId.get(id)!
}

export function rankedStamp(at: string, rank = 0): string {
  return rank === 0 ? at : new Date(Date.parse(at) + rank).toISOString()
}

/** Les lignes supprimées par « Supprimer », et celles plus récentes de leurs journées, telles que lues avant. */
export type KeptAhead = { deleted: readonly Line[]; ahead: readonly Line[] }

/**
 * R12, #842 : « Annuler » réécrit aussi telles quelles les lignes gardées devant, toutes rangées dans
 * l'ordre d'avant le geste ; refusé si l'une d'elles a changé depuis (`expectedUpdatedAt`).
 */
export function undoKeepingAhead(
  inverse: readonly DoseWrite[],
  { deleted, ahead }: KeptAhead,
): DoseWrite[] {
  const rankOf = undoRanks([...deleted, ...ahead])
  const isDeleted = new Set(deleted.map(({ id }) => id))
  return [
    ...inverse.map((write) =>
      write.action === 'restore' && isDeleted.has(write.id)
        ? { ...write, rank: rankOf(write.id) }
        : write,
    ),
    ...ahead.map((line): DoseWrite => ({
      action: 'rewrite',
      id: line.id,
      dose: doseFieldsOf(line),
      expectedUpdatedAt: line.updatedAt,
      rank: rankOf(line.id),
    })),
  ]
}
