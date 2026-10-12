import { hoursOf, isOnGrid, later, plusDays, sameFrequency } from '../grid'
import { isNote } from '../lines'
import { episodesOf, hasNotes } from '../settings'
import type {
  Day,
  Due,
  Refusal,
  Setting,
  SettingFields,
  SettingsPlan,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { settingsApplied } from './changes'
import {
  NEXT_DAYS,
  proposedDates,
  shownDay,
  shownFrom,
  type Dates,
  type Proposal,
  type SettingsRequest,
} from './settings-proposal'

export type { SettingsRequest } from './settings-proposal'

/** Q38 : sans prise, des échéances tombées ; « Elles restent à renseigner » ou « Elles n'étaient pas à donner ». */
export type FallenQuestion = { fallen: Due[]; keep: SettingsPlan; correct: SettingsPlan }

/** `shownOn` : la « Prochaine dose » que montre le formulaire, quand elle n'est pas la première échéance écrite. */
export type SettingsResult =
  | { plan: SettingsPlan; shownOn?: Day }
  | { question: FallenQuestion; shownOn?: Day }
  | { refusal: Refusal }

function fieldsOf(startsOn: Day, dates: Dates, request: SettingsRequest): SettingFields {
  return {
    startsOn,
    firstDueOn: dates.firstDueOn,
    gridOriginOn: dates.gridOriginOn,
    endsOn: request.endsOn,
    frequency: request.frequency,
    times: [...request.times],
  }
}

const rewrite = (current: Setting, setting: SettingFields): SettingsPlan => ({
  action: 'rewrite',
  id: current.id,
  setting,
})

const sameHours = (a: readonly string[], b: readonly string[]) =>
  hoursOf(a).join() === hoursOf(b).join()

const planOf = (draft: (dates: Dates) => SettingsPlan, { shownOn, ...dates }: Proposal) =>
  shownOn === undefined ? { plan: draft(dates) } : { plan: draft(dates), shownOn }

const readAfter =
  (input: TreatmentViewInput, draft: (dates: Dates) => SettingsPlan) => (dates: Dates) =>
    buildView(settingsApplied(input, draft(dates)))

// R10 : le réglage ouvert aujourd'hui, encore sans prise, est remplacé ; il est calculé comme s'il
// n'avait jamais existé, comme les autres réglages sans prise ouverts le même jour (synchro).
function replaced(
  input: TreatmentViewInput,
  current: Setting,
  request: SettingsRequest,
): SettingsResult {
  const episode = new Set(
    episodesOf(input.settings)
      .find((each) => each.some(({ id }) => id === current.id))!
      .map(({ id }) => id),
  )
  // R3 : un réglage remplacé avant son premier jour n'a pas été ouvert aujourd'hui, il reste.
  const gone = new Set(
    input.settings
      .filter(
        (each) =>
          each.id === current.id ||
          (episode.has(each.id) &&
            each.startsOn === current.startsOn &&
            !hasNotes(each, input.lines)),
      )
      .map(({ id }) => id),
  )
  const base = { ...input, settings: input.settings.filter(({ id }) => !gone.has(id)) }
  const before = buildView(base)
  const previous = before.phase === 'stopped' ? null : before.currentSetting
  const draft = (dates: Dates) => rewrite(current, fieldsOf(current.startsOn, dates, request))
  const proposal = proposedDates(
    base,
    previous,
    request,
    current.firstDueOn,
    readAfter(input, draft),
  )
  return 'refusal' in proposal ? proposal : planOf(draft, proposal)
}

// Q38 : les doses non renseignées du réglage en cours et sa dose du moment en retard.
function fallenOf(view: TreatmentView, current: Setting, today: Day): Due[] {
  const late = view.currentDoses.filter(({ dueOn }) => dueOn < today)
  return [...view.unloggedDoses, ...late]
    .filter(({ dueOn }) => dueOn >= current.startsOn)
    .sort((a, b) => `${a.dueOn} ${a.dueTime}`.localeCompare(`${b.dueOn} ${b.dueTime}`))
}

/**
 * R9, R10, TR-28, Q38 : le réglage à écrire quand « Modifier » change fréquence, heures, posologie, date
 * de fin ou rappel ; rien n'est écrit.
 */
export function newSettings(input: TreatmentViewInput, request: SettingsRequest): SettingsResult {
  const view = buildView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped') {
    throw new RangeError('Aucun réglage en cours : « Reprendre » ouvre le suivant')
  }
  const result = settingsFor(input, view, current, request)
  return leavesNoDose(input, request, result)
    ? { refusal: { reason: 'no-dose-before-end' } }
    : result
}

// #787, TR-8, Q20 : un rythme qui repart de sa première échéance ne laisse aucune dose encore à donner
// jusqu'à la date de fin ; une date de fin passée termine le traitement (TR-6).
function leavesNoDose(
  input: TreatmentViewInput,
  request: SettingsRequest,
  result: SettingsResult,
): boolean {
  const { endsOn } = request
  if (endsOn === null || endsOn < input.today) return false
  const plans =
    'plan' in result ? [result.plan] : 'question' in result ? [result.question.keep] : []
  return plans.some(
    (plan) =>
      plan.setting.gridOriginOn !== null &&
      !buildView(settingsApplied(input, plan))
        .slots([input.today, plan.setting.firstDueOn].sort()[0]!, endsOn)
        .some(({ state }) => state === 'pending'),
  )
}

function settingsFor(
  input: TreatmentViewInput,
  view: TreatmentView,
  current: Setting,
  request: SettingsRequest,
): SettingsResult {
  const { today } = input
  const sameRhythm =
    sameFrequency(current.frequency, request.frequency) && sameHours(current.times, request.times)
  const create = (dates: Dates): SettingsPlan => ({
    action: 'create',
    setting: fieldsOf(today, dates, request),
  })
  if (!hasNotes(current, input.lines)) {
    if (sameRhythm) return rhythmKept(input, view, current, request, create)
    if (current.startsOn === today) return replaced(input, current, request)
    return corrected(input, view, current, request, create)
  }
  const proposal = proposedDates(input, current, request, today, readAfter(input, create))
  return 'refusal' in proposal ? proposal : planOf(create, proposal)
}

// TR-9, TR-28 : même rythme et aucune prise, le réglage garde ses dates ; une autre « Prochaine
// dose » corrige sa première échéance tant qu'aucune n'est tombée, sinon les doses tombées restent
// à renseigner et le réglage part d'aujourd'hui.
function rhythmKept(
  input: TreatmentViewInput,
  view: TreatmentView,
  current: Setting,
  request: SettingsRequest,
  create: (dates: Dates) => SettingsPlan,
): SettingsResult {
  const { today } = input
  const { firstDueOn, gridOriginOn } = current
  const chosen = request.firstDueOn
  if (chosen === undefined || chosen === firstDueOn) {
    return {
      plan: rewrite(current, fieldsOf(current.startsOn, { firstDueOn, gridOriginOn }, request)),
    }
  }
  if (chosen < today) return { refusal: { reason: 'too-early', earliest: today } }
  const dates = { firstDueOn: chosen, gridOriginOn: chosen }
  if (fallenOf(view, current, today).length > 0) return { plan: create(dates) }
  const startsOn = chosen < current.startsOn ? chosen : current.startsOn
  return { plan: rewrite(current, fieldsOf(startsOn, dates, request)) }
}

// TR-28, Q38 : corrigé à fréquence gardée, le réglage garde sa grille et part de sa première journée
// encore due à partir d'aujourd'hui ; les échéances tombées sortent du carnet.
function keptCorrection(
  input: TreatmentViewInput,
  current: Setting,
  request: SettingsRequest,
): Dates {
  const { today } = input
  const { firstDueOn, gridOriginOn } = current
  const draft = rewrite(current, fieldsOf(current.startsOn, { firstDueOn, gridOriginOn }, request))
  const next = buildView(settingsApplied(input, draft))
    .slots(today, plusDays(today, NEXT_DAYS))
    .find(({ state }) => state === 'pending')?.due.dueOn
  const first = next ?? later(firstDueOn, today)
  const kept = gridOriginOn !== null && isOnGrid(gridOriginOn, request.frequency, first)
  return { firstDueOn: first, gridOriginOn: kept ? gridOriginOn : first }
}

// TR-28, Q38, Q39 : sans prise depuis son début, le réglage est corrigé ; avec des échéances
// tombées, l'enregistrement demande s'il faut les garder à renseigner.
function corrected(
  input: TreatmentViewInput,
  view: TreatmentView,
  current: Setting,
  request: SettingsRequest,
  create: (dates: Dates) => SettingsPlan,
): SettingsResult {
  const { today } = input
  const { firstDueOn: chosen, ...asked } = request
  const fallen = fallenOf(view, current, today)
  const correctFrom = (dates: Dates) => {
    const startsOn = dates.firstDueOn < current.startsOn ? dates.firstDueOn : current.startsOn
    return rewrite(current, fieldsOf(startsOn, dates, request))
  }
  const answer = (keep: SettingsPlan, correct: SettingsPlan, shownOn?: Day): SettingsResult => {
    const result = fallen.length === 0 ? { plan: correct } : { question: { fallen, keep, correct } }
    const first = 'plan' in result ? correct : keep
    return shownOn === undefined || shownOn === first.setting.firstDueOn
      ? result
      : { ...result, shownOn }
  }
  const neverNoted = !input.lines.some(isNote)
  const questioned = neverNoted && fallen.length > 0
  const fallback = questioned ? today : later(current.firstDueOn, today)
  const proposal = proposedDates(input, current, asked, fallback, readAfter(input, create))
  if ('refusal' in proposal) return proposal
  const own = (first: Day): Dates => ({ firstDueOn: first, gridOriginOn: first })
  const fixed = questioned
    ? own(shownFrom(today, readAfter(input, correctFrom)))
    : sameFrequency(current.frequency, request.frequency)
      ? keptCorrection(input, current, request)
      : own(shownFrom(later(proposal.firstDueOn, today), readAfter(input, correctFrom)))
  // Q38 : la date que montre le formulaire, passée telle quelle, n'est pas une date choisie.
  const shown =
    fallen.length === 0
      ? shownDay(fixed, readAfter(input, correctFrom))
      : (proposal.shownOn ?? proposal.firstDueOn)
  const implicit = answer(create(proposal), correctFrom(fixed), shown)
  const written = fallen.length === 0 ? fixed.firstDueOn : proposal.firstDueOn
  if (chosen === undefined || chosen === written || chosen === shown) return implicit
  if (chosen < today) return { refusal: { reason: 'too-early', earliest: today } }
  return answer(create(own(chosen)), correctFrom(own(chosen)))
}
