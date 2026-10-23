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

/** Une ligne lue avant le geste, avec sa dernière écriture : la garde du lot inverse. */
export type KeptLine = Line & { updatedAt: string }

/**
 * Les lignes supprimées par « Supprimer » ou réécrites par une note alors qu'elles étaient grisées
 * (TR-25), et celles plus récentes de leurs journées, telles que lues avant le geste.
 */
export type KeptAhead = { touched: readonly KeptLine[]; ahead: readonly KeptLine[] }

/**
 * R12, #842 : « Annuler » réécrit aussi telles quelles les lignes gardées devant, toutes rangées dans
 * l'ordre d'avant le geste ; refusé si l'une d'elles a changé depuis (`expectedUpdatedAt`).
 */
export function undoKeepingAhead(
  inverse: readonly DoseWrite[],
  { touched, ahead }: KeptAhead,
): DoseWrite[] {
  const rankOf = undoRanks([...touched, ...ahead])
  const isTouched = new Set(touched.map(({ id }) => id))
  return [
    ...inverse.map((write) =>
      write.action === 'restore' && isTouched.has(write.id)
        ? { ...write, rank: rankOf(write.id) }
        : write,
    ),
    ...ahead.map((line): DoseWrite => ({
      action: 'rewrite',
      id: line.id,
      dose: doseFieldsOf(line),
      expectedUpdatedAt: line.updatedAt,
      rank: rankOf(line.id),
      decidedAt: line.decidedAt,
    })),
  ]
}
