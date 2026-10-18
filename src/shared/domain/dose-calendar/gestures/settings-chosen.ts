import { dayOfKey } from '../grid'
import { isTaken } from '../lines'
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

function laterNote(input: TreatmentViewInput, isLater: (day: Day) => boolean): Refusal | null {
  const episode = new Set((episodesOf(input.settings).at(-1) ?? []).map(({ id }) => id))
  const later = buildView(input).history.some(
    ({ line, effect }) =>
      isTaken(line) &&
      episode.has(line.settingId) &&
      effect.kind === 'covers' &&
      isLater(dayOfKey(effect.key)),
  )
  return later ? { reason: 'later-dose' } : null
}

/**
 * Q26, G7, R12, #811 : « Prochaine dose » grisée quand une dose est déjà notée plus loin que le jour
 * de la modification ou que la date proposée, sauf sur la date proposée elle-même (G24) ;
 * `implicit` : la réponse de « Modifier » sans date choisie.
 */
export function chosenDateRefusal(
  input: TreatmentViewInput,
  implicit: SettingsResult,
): Refusal | null {
  const shown = shownOf(implicit)
  if (shown === undefined) return null
  const from = shown < input.today ? shown : input.today
  return laterNote(input, (day) => day > from && day !== shown)
}

/** Q26 : une date choisie avant une dose déjà notée, ou dans un champ grisé, est refusée. */
export function chosenRefusal(
  input: TreatmentViewInput,
  chosen: Day,
  implicit: SettingsResult,
): Refusal | null {
  return chosenDateRefusal(input, implicit) ?? laterNote(input, (day) => day > chosen)
}

/**
 * R7, #796 : à fréquence gardée, une date choisie emmène le report qui arrive à la dose du moment ;
 * « Elles restent à renseigner » garde la dose du moment, la date n'ouvre que la nouvelle grille (#817).
 */
export function withChosenDate(
  input: TreatmentViewInput,
  chosen: Day | undefined,
  result: SettingsResult,
  implicit: SettingsResult,
): SettingsResult {
  if (!isChosen(chosen, implicit) || 'refusal' in result) return result
  const lines = arrivalMoved(input, chosen)
  if (lines.length === 0) return result
  const carry = (plan: SettingsPlan) => ({ ...plan, lines: [...(plan.lines ?? []), ...lines] })
  if ('plan' in result) return { ...result, plan: carry(result.plan) }
  const { correct } = result.question
  if ('refusal' in correct) return result
  return { ...result, question: { ...result.question, correct: carry(correct) } }
}
