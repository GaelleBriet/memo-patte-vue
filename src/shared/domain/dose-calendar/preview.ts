import { applied, settingsApplied } from './gestures/changes'
import { moveDose } from './gestures/move'
import { noteDose } from './gestures/note'
import { redateDose } from './gestures/redate'
import { removeLine } from './gestures/remove'
import type { Gesture, GestureResult, Refusal, SettingsPlan, TreatmentViewInput } from './types'
import { buildView, type TreatmentView } from './view'

/** Les lignes qu'écrirait le geste, ou pourquoi il est refusé ; rien n'est écrit. */
export function play(input: TreatmentViewInput, gesture: Gesture): GestureResult {
  switch (gesture.kind) {
    case 'note':
      return noteDose(input, gesture)
    case 'move':
      return moveDose(input, gesture)
    case 'redate':
      return redateDose(input, gesture)
    case 'remove':
      return removeLine(input, gesture.lineId)
  }
}

/**
 * R12 : la lecture du traitement après le geste ou le réglage, sur le carnet simulé : ce que les écrans
 * montreront.
 */
export function preview(input: TreatmentViewInput, plan: SettingsPlan): TreatmentView
export function preview(
  input: TreatmentViewInput,
  gesture: Gesture,
): TreatmentView | { refusal: Refusal }
export function preview(
  input: TreatmentViewInput,
  change: Gesture | SettingsPlan,
): TreatmentView | { refusal: Refusal } {
  if ('action' in change) return buildView(settingsApplied(input, change))
  const result = play(input, change)
  return 'refusal' in result ? result : buildView(applied(input, result.changes))
}
