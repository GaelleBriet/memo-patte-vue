import { doseFieldsOf } from './treatment-dose-writes'
import type { DoseWrite } from '../schema/treatment-dose.schema'
import type { Line } from '@/shared/domain/dose-calendar'

/** Une ligne lue avant le geste, avec sa dernière écriture : la garde du lot inverse. */
export type KeptLine = Line & { updatedAt: string }

/**
 * R12, #842 : « Annuler » réécrit aussi telles quelles, avec leur décision, les lignes gardées devant ;
 * refusé si l'une d'elles a changé depuis (`expectedUpdatedAt`).
 */
export function undoKeepingAhead(
  inverse: readonly DoseWrite[],
  ahead: readonly KeptLine[],
): DoseWrite[] {
  return [
    ...inverse,
    ...ahead.map((line): DoseWrite => ({
      action: 'rewrite',
      id: line.id,
      dose: doseFieldsOf(line),
      expectedUpdatedAt: line.updatedAt,
      decidedAt: line.decidedAt,
    })),
  ]
}
