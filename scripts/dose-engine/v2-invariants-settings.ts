import {
  newSettings,
  preview,
  type SettingsPlan,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { dueKey } from './display'
import { compare, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

type Misread = { early: boolean; text: string }

// R12 : ce que la lecture du carnet écrit montre au lieu de la première échéance attendue, ou `null` ;
// un report reste une ligne du traitement (R7) : son arrivée peut précéder, son départ vide le jour.
function misreadFirstDue(
  input: TreatmentViewInput,
  plan: SettingsPlan,
  day: string,
): Misread | null {
  const view = preview(input, plan)
  if (view.phase === 'ended' || view.phase === 'stopped') return null
  const moves = view.history.flatMap(({ effect }) => (effect.kind === 'moves' ? [effect] : []))
  const arrivals = new Set(moves.map(({ arrival }) => arrival))
  const emptied = moves.some(({ keys }) => keys.some((key) => key.startsWith(day)))
  if (view.slots(day, day).length === 0 && !emptied) {
    return { early: false, text: `aucune échéance le ${day}` }
  }
  const early = [...view.currentDoses, ...view.upcoming({ to: day })].filter(
    ({ dueOn }) => dueOn >= input.today && dueOn < day && !arrivals.has(dueOn),
  )
  return early.length === 0 ? null : { early: true, text: `${dueKey(early[0]!)} avant le ${day}` }
}

/**
 * 9. R9, R12 : « Modifier » montre la première échéance qu'il propose ; la même demande, la date
 * proposée passée en clair, rend la même réponse ; une autre date choisie est celle que la fiche lit.
 */
export function settingsProposal(step: V2Step): Broken | null {
  if (step.plan === null || step.request === undefined) return null
  const { before, plan } = step
  const { firstDueOn: chosen, ...asked } = step.request
  const proposed = newSettings(before, asked)
  // #787 (décision du 2026-10-12) : un rythme sans dose avant la date de fin se refuse sans date.
  if ('refusal' in proposed && proposed.refusal.reason === 'no-dose-before-end') return null
  if ('refusal' in proposed) {
    return { invariant: 'proposition', detail: `refus sans date : ${proposed.refusal.reason}` }
  }
  const plans =
    'plan' in proposed ? [proposed.plan] : [proposed.question.keep, proposed.question.correct]
  const date = plans[0]!.setting.firstDueOn
  const explicit = compare(
    'date proposée en clair',
    proposed,
    newSettings(before, { ...asked, firstDueOn: date }),
  )
  if (explicit !== null) return explicit
  // TR-28 : même rythme et aucune prise, le réglage corrigé garde ses dates, il ne propose rien.
  const keepsDates = (each: SettingsPlan) =>
    each.action === 'rewrite' &&
    before.settings.some(
      ({ id, firstDueOn, gridOriginOn }) =>
        id === each.id &&
        firstDueOn === each.setting.firstDueOn &&
        gridOriginOn === each.setting.gridOriginOn,
    )
  // Question ouverte (R6, R10, TR-28) : le décalage d'un réglage réécrit vaut encore pour son
  // nouveau rythme, avant la première échéance posée ; la date proposée, elle, est toujours lue.
  const staleShift = (each: SettingsPlan, day: string) =>
    each.action === 'rewrite' &&
    each.setting.gridOriginOn !== null &&
    before.lines.some(
      ({ status, settingId, dueOn }) => status === 'shift' && settingId === each.id && dueOn < day,
    )
  for (const each of plans.filter((one) => !keepsDates(one))) {
    const day = each.setting.firstDueOn
    const misread = misreadFirstDue(before, each, day)
    if (misread !== null && !(misread.early && staleShift(each, day))) {
      return { invariant: 'proposée ≠ montrée', detail: `${misread.text}\n${JSON.stringify(each)}` }
    }
  }
  if (chosen === undefined || chosen === date) return null
  if (plan.setting.firstDueOn !== chosen) {
    return { invariant: 'date choisie', detail: `${chosen} ≠ ${JSON.stringify(plan)}` }
  }
  // Question ouverte (TR-9, G6) : une date prise dans l'écart d'un décalage, son ancrage compris.
  const inShift = preview(before, plan).history.some(
    ({ line, effect }) =>
      effect.kind === 'shifts' && effect.from < chosen && chosen <= (line.targetOn ?? ''),
  )
  const misread = inShift || staleShift(plan, chosen) ? null : misreadFirstDue(before, plan, chosen)
  return misread === null
    ? null
    : { invariant: 'choisie ≠ montrée', detail: `${misread.text}\n${JSON.stringify(plan)}` }
}
