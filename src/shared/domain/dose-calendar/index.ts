import type { TreatmentViewInput } from './types'
import { buildView, type TreatmentView } from './view'

export { viewInputOf, type LegacyInput } from './legacy-input'
export { applied, settingsApplied } from './gestures/changes'
export { moveBounds, moveDose, type MoveBounds } from './gestures/move'
export { dueForDate, noteDose } from './gestures/note'
export { redateDose } from './gestures/redate'
export { removalRefusal, removeLine } from './gestures/remove'
export {
  newSettings,
  type FallenQuestion,
  type SettingsRequest,
  type SettingsResult,
} from './gestures/settings'
export { play, preview } from './preview'
export type { DueSlot, HistoryLine, TreatmentView, Window } from './view'
export type * from './types'

/** R12 : la lecture d'un traitement, seule entrée du moteur des doses. */
export function treatmentView(input: TreatmentViewInput): TreatmentView {
  return buildView(input)
}
