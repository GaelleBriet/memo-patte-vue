import {
  newSettings,
  preview,
  type SettingsPlan,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { dueKey } from './display'
import { compare, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

// R12 : ce que la lecture du carnet écrit montre au lieu de la première échéance attendue, ou `null` ;
// un report reste une ligne du traitement (R7) : son arrivée peut précéder, son départ vide le jour.
function misreadFirstDue(
  input: TreatmentViewInput,
  plan: SettingsPlan,
  day: string,
  proposed = false,
): string | null {
  const view = preview(input, plan)
  const { endsOn, gridOriginOn } = plan.setting
  // TR-6 : une date de fin passée, ou atteinte à fréquence gardée, termine le traitement.
  const finishes = gridOriginOn === null || (endsOn !== null && endsOn < input.today)
  if (view.phase === 'stopped' || (view.phase === 'ended' && finishes)) return null
  const moves = view.history.flatMap(({ effect }) => (effect.kind === 'moves' ? [effect] : []))
  const arrivals = new Set(moves.map(({ arrival }) => arrival))
  const emptied = moves.some(({ keys }) => keys.some((key) => key.startsWith(day)))
  if (view.slots(day, day).length === 0 && !emptied) {
    return `aucune échéance le ${day}`
  }
  // R12 : la date proposée est une dose encore à donner, comme sur la fiche.
  const pending = view.slots(day, day).some(({ state }) => state === 'pending')
  if (proposed && !pending && !emptied) {
    return `journée déjà toute notée le ${day}`
  }
  const early = [...view.currentDoses, ...view.upcoming({ to: day })].filter(
    ({ dueOn }) => dueOn >= input.today && dueOn < day && !arrivals.has(dueOn),
  )
  return early.length === 0 ? null : `${dueKey(early[0]!)} avant le ${day}`
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
  // #787 : un rythme sans dose avant la date de fin se refuse sans date.
  if ('refusal' in proposed && proposed.refusal.reason === 'no-dose-before-end') return null
  if ('refusal' in proposed) {
    return { invariant: 'proposition', detail: `refus sans date : ${proposed.refusal.reason}` }
  }
  // #806 : « Elles n'étaient pas à donner » refusée n'annonce aucune date.
  const plans = (
    'plan' in proposed ? [proposed.plan] : [proposed.question.keep, proposed.question.correct]
  ).filter((each): each is SettingsPlan => 'setting' in each)
  const date = proposed.shownOn ?? plans[0]!.setting.firstDueOn
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
  for (const each of plans.filter((one) => !keepsDates(one))) {
    const day = each === plans[0] ? date : each.setting.firstDueOn
    const misread = misreadFirstDue(before, each, day, each === plans[0])
    if (misread !== null) {
      return { invariant: 'proposée ≠ montrée', detail: `${misread}\n${JSON.stringify(each)}` }
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
  const misread = inShift ? null : misreadFirstDue(before, plan, chosen)
  return misread === null
    ? null
    : { invariant: 'choisie ≠ montrée', detail: `${misread}\n${JSON.stringify(plan)}` }
}
