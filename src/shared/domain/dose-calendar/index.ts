import type { TreatmentViewInput } from './types'
import { buildView, type TreatmentView } from './view'

export { viewInputOf, type LegacyInput } from './legacy-input'
export type { HistoryLine, TreatmentView, Window } from './view'
export type * from './types'

/** R12 : la lecture d'un traitement, seule entrée du moteur des doses. */
export function treatmentView(input: TreatmentViewInput): TreatmentView {
  return buildView(input)
}
