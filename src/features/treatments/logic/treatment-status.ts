import type { Treatment } from '../schema/treatment.schema'

/** Un traitement arrêté n'a plus de rappel et sort des traitements en cours. */
export function isOngoing(treatment: Pick<Treatment, 'stoppedOn'>): boolean {
  return treatment.stoppedOn === null
}
