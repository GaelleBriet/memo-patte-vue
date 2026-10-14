import type { Day, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { settingsApplied } from './changes'
import type { SettingsResult } from './settings'
import { firstPending } from './settings-proposal'

const NO_DOSE = { refusal: { reason: 'no-dose-before-end' } } as const

// TR-6 : une fin passée termine le traitement ; un réglage qui garde ses dates ne repart pas (Q20).
function leavesNoDose(input: TreatmentViewInput, endsOn: Day, plan: SettingsPlan): boolean {
  const { setting } = plan
  const keepsDates =
    plan.action === 'rewrite' &&
    input.settings.some(
      ({ id, firstDueOn, gridOriginOn }) =>
        id === plan.id &&
        firstDueOn === setting.firstDueOn &&
        gridOriginOn === setting.gridOriginOn,
    )
  return (
    setting.gridOriginOn !== null &&
    !keepsDates &&
    firstPending(buildView(settingsApplied(input, plan)), setting.firstDueOn, endsOn) === undefined
  )
}

/**
 * #787, #806, TR-8 : un rythme qui repart sans plus aucune dose à donner avant la date de fin est
 * refusé ; à la question Q38, seule la réponse « Elles n'étaient pas à donner » peut l'être.
 */
export function endChecked(
  input: TreatmentViewInput,
  endsOn: Day | null,
  result: SettingsResult,
): SettingsResult {
  if (endsOn === null || endsOn < input.today || 'refusal' in result) return result
  const empty = (plan: SettingsPlan) => leavesNoDose(input, endsOn, plan)
  if ('plan' in result) return empty(result.plan) ? NO_DOSE : result
  const { keep, correct } = result.question
  if (empty(keep)) return NO_DOSE
  if ('refusal' in correct || !empty(correct)) return result
  return { ...result, question: { ...result.question, correct: NO_DOSE } }
}
