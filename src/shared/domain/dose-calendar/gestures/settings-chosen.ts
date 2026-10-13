import { dayOfKey } from '../grid'
import { isNote } from '../lines'
import { episodesOf } from '../settings'
import type { Day, Refusal, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { arrivalFollowing } from './move'
import type { SettingsResult } from './settings'

// R9, R7 : seule une dose du moment qui est l'arrivée d'un report l'emmène ; en retard ou du jour,
// c'est elle que la date choisie remplace (TR-9).
function arrivalMoved(input: TreatmentViewInput, chosen: Day): NonNullable<SettingsPlan['lines']> {
  const [next] = buildView(input).currentDoses
  if (next === undefined || next.dueOn === chosen) return []
  return arrivalFollowing(input, next, chosen).filter(
    (change): change is NonNullable<SettingsPlan['lines']>[number] => change.action !== 'create',
  )
}

// La date que le formulaire propose, passée telle quelle, n'est pas une date choisie (Q38, R12).
function implicitDays(result: SettingsResult): Day[] {
  if ('refusal' in result) return []
  const { keep, correct } = 'question' in result ? result.question : { keep: result.plan }
  const plans = correct === undefined || 'refusal' in correct ? [keep] : [keep, correct]
  return [
    ...plans.map(({ setting }) => setting.firstDueOn),
    ...(result.shownOn === undefined ? [] : [result.shownOn]),
  ]
}

export const isChosen = (chosen: Day | undefined, implicit: SettingsResult): chosen is Day =>
  chosen !== undefined && !implicitDays(implicit).includes(chosen)

const shownOf = (result: SettingsResult): Day | undefined =>
  'refusal' in result
    ? undefined
    : (result.shownOn ?? ('plan' in result ? result.plan : result.question.keep).setting.firstDueOn)

function laterNote(input: TreatmentViewInput, day: Day): Refusal | null {
  const episode = new Set((episodesOf(input.settings).at(-1) ?? []).map(({ id }) => id))
  const later = buildView(input).history.some(
    ({ line, effect }) =>
      isNote(line) &&
      episode.has(line.settingId) &&
      effect.kind === 'covers' &&
      dayOfKey(effect.key) > day,
  )
  return later ? { reason: 'later-dose' } : null
}

/**
 * Q26, G7, R12 : « Prochaine dose » grisée quand une dose plus lointaine que celle proposée est déjà
 * notée ; `implicit` : la réponse de « Modifier » sans date choisie.
 */
export function chosenDateRefusal(
  input: TreatmentViewInput,
  implicit: SettingsResult,
): Refusal | null {
  const shown = shownOf(implicit)
  return shown === undefined ? null : laterNote(input, shown)
}

/** Q26 : une date choisie avant une dose déjà notée, ou dans un champ grisé, est refusée. */
export function chosenRefusal(
  input: TreatmentViewInput,
  chosen: Day,
  implicit: SettingsResult,
): Refusal | null {
  return chosenDateRefusal(input, implicit) ?? laterNote(input, chosen)
}

/** R7, #796 : à fréquence gardée, une date choisie emmène le report qui arrive à la dose du moment. */
export function withChosenDate(
  input: TreatmentViewInput,
  chosen: Day | undefined,
  result: SettingsResult,
  implicit: SettingsResult,
): SettingsResult {
  if (!isChosen(chosen, implicit) || 'refusal' in result) return result
  const lines = arrivalMoved(input, chosen)
  if (lines.length === 0) return result
  const carry = (plan: SettingsPlan) => ({ ...plan, lines })
  if ('plan' in result) return { ...result, plan: carry(result.plan) }
  const { keep, correct } = result.question
  const carried = 'refusal' in correct ? correct : carry(correct)
  return { ...result, question: { ...result.question, keep: carry(keep), correct: carried } }
}
