import type { TreatmentViewInput } from './types'
import { buildView, type TreatmentView } from './view'

export {
  gridOriginsOf,
  legacyFactsOf,
  targetOnOf,
  type LegacyDose,
  type LegacyPeriod,
  type SettingFacts,
} from './legacy-input'
export {
  applied,
  judgedGridAt,
  rewritesCalendar,
  rewritesGrid,
  rewrittenSetting,
  settingsApplied,
} from './gestures/changes'
export { moveBounds, moveDose, type MoveBounds } from './gestures/move'
export { dueForDate, noteDose } from './gestures/note'
export { redateDose } from './gestures/redate'
export { keptAhead, removalRefusal, removeLine, reportRemovalLock } from './gestures/remove'
export {
  newSettings,
  type FallenQuestion,
  type SettingsRequest,
  type SettingsResult,
} from './gestures/settings'
export { chosenDateRefusal } from './gestures/settings-chosen'
export { familyOf, isAdvanced } from './lines'
export { play, preview } from './preview'
export { reportFactsIn, reportFactsOf, withReportFacts, type ReportFacts } from './report-facts'
export type { DueReminder, ReminderMoment, ReminderReading, ReminderWindow } from './reminders'
export type { DueSlot, HistoryLine, TreatmentView, Window } from './view'
export { gridBeforeOf } from './grid-before'
export { FALLEN_DOSES_ANSWERS } from './types'
export type * from './types'

/** R12 : la lecture d'un traitement, seule entrée du moteur des doses. */
export function treatmentView(input: TreatmentViewInput): TreatmentView {
  return buildView(input)
}
