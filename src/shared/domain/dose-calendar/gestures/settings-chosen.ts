import { plusDays } from '../grid'
import { isNote } from '../lines'
import { episodesOf } from '../settings'
import type { Day, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { arrivalFollowing } from './move'
import type { SettingsResult } from './settings'
import { NEXT_DAYS } from './settings-proposal'

// R7, R9, #796 : la date choisie déplace la prochaine dose ; quand c'est l'arrivée d'un report, elle
// l'emmène comme « Prochaine dose ».
function arrivalMoved(input: TreatmentViewInput, chosen: Day): NonNullable<SettingsPlan['lines']> {
  const { today } = input
  const next = buildView(input)
    .slots(today, plusDays(today, NEXT_DAYS))
    .find(({ state }) => state === 'pending')?.due
  if (next === undefined || next.dueOn === chosen) return []
  return arrivalFollowing(input, next, chosen).filter(
    (change): change is NonNullable<SettingsPlan['lines']>[number] => change.action !== 'create',
  )
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

// Q26 : une dose déjà notée plus loin que la date choisie, dans la période en cours.
function notedLater(input: TreatmentViewInput, chosen: Day): boolean {
  const episode = new Set(
    episodesOf(input.settings)
      .at(-1)!
      .map(({ id }) => id),
  )
  return input.lines.some(
    (line) => isNote(line) && episode.has(line.settingId) && line.dueOn > chosen,
  )
}

/**
 * R7, #796 : à fréquence gardée, une « Prochaine dose » choisie, qui n'est pas la date proposée,
 * emporte le report qui arrive à la prochaine dose ; rien ne bouge avant une dose notée plus loin.
 */
export function withChosenDate(
  input: TreatmentViewInput,
  chosen: Day | undefined,
  result: SettingsResult,
  implicit: () => SettingsResult,
): SettingsResult {
  if (chosen === undefined || 'refusal' in result) return result
  if (implicitDays(implicit()).includes(chosen) || notedLater(input, chosen)) return result
  const lines = arrivalMoved(input, chosen)
  if (lines.length === 0) return result
  const carry = (plan: SettingsPlan) =>
    plan.setting.firstDueOn === chosen ? { ...plan, lines } : plan
  if ('plan' in result) return { ...result, plan: carry(result.plan) }
  const { keep, correct } = result.question
  return { ...result, question: { ...result.question, keep: carry(keep), correct: carry(correct) } }
}
