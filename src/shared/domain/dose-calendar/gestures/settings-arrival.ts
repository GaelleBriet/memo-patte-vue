import { plusDays } from '../grid'
import type { Day, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import type { SettingsResult } from './settings'
import { NEXT_DAYS } from './settings-proposal'

// R7, R9, #796 : la date choisie déplace la prochaine dose ; quand c'est l'arrivée d'un report, sa
// ligne est réécrite pour arriver ce jour-là, ou supprimée si la dose revient à son jour d'origine.
function arrivalMoved(input: TreatmentViewInput, chosen: Day): NonNullable<SettingsPlan['lines']> {
  const view = buildView(input)
  const { today } = input
  const next = view
    .slots(today, plusDays(today, NEXT_DAYS))
    .find(({ state }) => state === 'pending')?.due.dueOn
  if (next === undefined || next === chosen) return []
  return view.history.flatMap(({ line, effect }): NonNullable<SettingsPlan['lines']> => {
    if (effect.kind !== 'moves' || effect.arrival !== next) return []
    const { id, updatedAt: _, ...fields } = line
    return line.dueOn === chosen
      ? [{ action: 'delete', id }]
      : [{ action: 'rewrite', id, line: { ...fields, targetOn: chosen } }]
  })
}

// La date que le formulaire propose, passée telle quelle, n'est pas une date choisie (Q38, R12).
function implicitDays(result: SettingsResult): Day[] {
  if ('refusal' in result) return []
  const plans = 'plan' in result ? [result.plan] : [result.question.keep, result.question.correct]
  return [
    ...plans.map(({ setting }) => setting.firstDueOn),
    ...(result.shownOn === undefined ? [] : [result.shownOn]),
  ]
}

/** R7, #796 : un plan qui écrit une date choisie comme première échéance emporte le report qui y arrive. */
export function withArrival(
  input: TreatmentViewInput,
  chosen: Day | undefined,
  result: SettingsResult,
  implicit: () => SettingsResult,
): SettingsResult {
  if (chosen === undefined || 'refusal' in result) return result
  if (implicitDays(implicit()).includes(chosen)) return result
  const lines = arrivalMoved(input, chosen)
  if (lines.length === 0) return result
  const carry = (plan: SettingsPlan) =>
    plan.setting.firstDueOn === chosen ? { ...plan, lines } : plan
  if ('plan' in result) return { ...result, plan: carry(result.plan) }
  const { keep, correct } = result.question
  return { ...result, question: { ...result.question, keep: carry(keep), correct: carry(correct) } }
}
