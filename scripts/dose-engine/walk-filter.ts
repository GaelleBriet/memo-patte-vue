import {
  applied,
  moveDose,
  newSettings,
  noteDose,
  redateDose,
  removeLine,
  settingsApplied,
  treatmentView,
  viewInputOf,
  type GestureResult,
  type Line,
  type SettingsRequest,
  type SettingsResult,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import type { Due } from '@/shared/domain/treatment-schedule'

import { plusDays, type Book } from './carnet'
import { dueKey, HORIZON_DAYS } from './display'
import { keptBook, type Walk } from './walk-state'

export const v2Due = ({ periodId, dueOn, dueTime }: Due) => ({
  settingId: periodId,
  dueOn,
  dueTime,
})

const signature = (lines: readonly Line[]) =>
  lines
    .map(({ settingId, dueOn, dueTime, status, givenOn, targetOn }) =>
      JSON.stringify([settingId, dueOn, dueTime, status, givenOn, targetOn]),
    )
    .sort()

// La règle qui sépare les deux carnets, d'après les lignes que l'un écrit et pas l'autre.
function differenceOf(mine: string[], target: string[]): string {
  const statuses = [
    ...mine.filter((line) => !target.includes(line)),
    ...target.filter((line) => !mine.includes(line)),
  ].map((line) => (JSON.parse(line) as string[])[3])
  if (statuses.includes('extra')) return 'v2 écrit autre chose (R5, prise en plus)'
  if (statuses.includes('postponed')) return 'v2 écrit autre chose (R7, report)'
  if (statuses.every((status) => status === 'shift')) return 'v2 écrit autre chose (R6, décalage)'
  return 'v2 écrit autre chose (prise)'
}

export type V2Play = (input: TreatmentViewInput) => GestureResult

/** Ce que l'oracle sait du geste pour repérer un refus suspect (I4 du pas 3). */
export type Probe = { due?: ReturnType<typeof v2Due>; redate?: boolean }

const REPORT_REFUSALS = ['passes-report', 'stuck-report', 'report-loop']

// Un refus de v2 sur une échéance que sa propre vue propose, ou une correction que le moteur actuel
// accepte et que v2 refuse à cause d'un report : à analyser, jamais caché dans un simple compte.
function suspectOf(input: TreatmentViewInput, refusals: string[], probe: Probe): string | null {
  if (probe.redate === true) {
    const report = refusals.find((reason) => REPORT_REFUSALS.includes(reason))
    if (report !== undefined) return `correction acceptée par le moteur actuel (${report})`
  }
  if (probe.due === undefined) return null
  const view = treatmentView(input)
  const proposed = [
    ...view.currentDoses,
    ...(view.nextDue === null ? [] : [view.nextDue]),
    ...view.upcoming({ limit: 3 }),
  ]
  const { dueOn, dueTime } = probe.due
  const own = proposed.some((due) => due.dueOn === dueOn && due.dueTime === dueTime)
  return own ? `échéance proposée par v2 (${refusals[0]})` : null
}

/**
 * L'oracle ne compare que des carnets que l'app peut produire : un geste du moteur actuel n'est joué
 * que si le moteur v2, pour le même geste (case cochée ou non), écrit le même carnet. Sinon il est
 * compté avec sa raison (refus de v2, ou autres lignes) et le carnet reste tel quel ; un refus suspect
 * est listé à part.
 */
export function refusedByV2(
  walk: Walk,
  gesture: string,
  after: Book,
  plays: V2Play[],
  probe: Probe = {},
): boolean {
  if (walk.filter === 'aucun') return false
  const input = viewInputOf(keptBook(walk))
  const target = signature(viewInputOf({ ...after, doses: [...after.doses, ...walk.purged] }).lines)
  const reasons: string[] = []
  const refusals: string[] = []
  for (const play of plays) {
    let result: GestureResult
    try {
      result = play(input)
    } catch (error) {
      reasons.push(`v2 lève (${String(error).slice(0, 60)})`)
      continue
    }
    if ('refusal' in result) {
      reasons.push(result.refusal.reason)
      refusals.push(result.refusal.reason)
      continue
    }
    const mine = signature(applied(input, result.changes).lines)
    if (mine.join() === target.join()) return false
    reasons.push(differenceOf(mine, target))
  }
  const allRefused = refusals.length === plays.length
  const suspect = allRefused || probe.redate === true ? suspectOf(input, refusals, probe) : null
  walk.refused.push({
    gesture,
    reason: reasons[0] ?? 'aucun geste v2',
    ...(suspect === null ? {} : { suspect, input }),
  })
  return true
}

export const v2 = { moveDose, noteDose, redateDose, removeLine }

/** Le geste v2 joué case cochée, puis décochée. */
export const bothBoxes = (play: (shiftsFollowing: boolean) => V2Play): V2Play[] => [
  play(true),
  play(false),
]

// Ce que montre un carnet : doses du moment, à renseigner, calendrier et effet de chaque ligne.
function shownBy(input: TreatmentViewInput): string {
  const view = treatmentView(input)
  const from = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  const slots = view
    .slots(from, plusDays(input.today, HORIZON_DAYS))
    .map(({ due, state }) => `${dueKey(due)} ${state}`)
  const effects = view.history.map(({ line, effect }) => `${line.id} ${JSON.stringify(effect)}`)
  return JSON.stringify([
    view.phase,
    view.currentDoses.map(dueKey),
    view.unloggedDoses.map(dueKey),
    slots,
    effects,
  ])
}

// La règle qui sépare le réglage du moteur actuel de celui que v2 écrirait.
function settingsReasonOf(result: SettingsResult, after: Book): string {
  if ('refusal' in result) return result.refusal.reason
  if ('question' in result) return 'v2 pose la question Q38'
  const { plan } = result
  if (plan.action === 'rewrite') return 'v2 corrige le réglage (R10, TR-28)'
  const period = after.periods.at(-1)!
  return plan.setting.firstDueOn === period.firstDueOn
    ? 'v2 garde une autre grille (R3)'
    : 'v2 propose une autre première échéance (R9)'
}

/**
 * « Modifier » n'est joué que si le réglage que v2 écrirait (R9, R10, Q38) se lit comme celui que le
 * moteur actuel propose ; sinon le geste est compté avec sa raison, et chaque raison est à analyser.
 */
export function settingsRefusedByV2(
  walk: Walk,
  gesture: string,
  after: Book,
  request: SettingsRequest,
): boolean {
  if (walk.filter === 'aucun') return false
  const input = viewInputOf(keptBook(walk))
  const target = viewInputOf({ ...after, doses: [...after.doses, ...walk.purged] })
  let reason: string
  try {
    const result = newSettings(input, request)
    if ('plan' in result && shownBy(settingsApplied(input, result.plan)) === shownBy(target)) {
      return false
    }
    reason = settingsReasonOf(result, after)
  } catch (error) {
    reason = `v2 lève (${String(error).slice(0, 60)})`
  }
  walk.refused.push({ gesture, reason, suspect: `réglage : ${reason}`, input })
  return true
}
