import { hoursOf, later, sameFrequency } from '../grid'
import { isTaken } from '../lines'
import { episodesOf, hasNotes } from '../settings'
import type {
  Day,
  Due,
  FallenDosesAnswer,
  Refusal,
  Setting,
  SettingFields,
  SettingsPlan,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { settingsApplied, written } from './changes'
import { chosenRefusal, isChosen, withChosenDate } from './settings-chosen'
import { endChecked } from './settings-end'
import { keptCorrection } from './settings-kept'
import {
  proposedDates,
  shownDay,
  shownFrom,
  type Dates,
  type Proposal,
  type SettingsRequest,
} from './settings-proposal'

export type { SettingsRequest } from './settings-proposal'

/**
 * Q38 : sans prise, des échéances tombées ; « Elles restent à renseigner » ou « Elles n'étaient pas à
 * donner », refusée quand elle ne laisse plus aucune dose avant la date de fin (#806).
 */
export type FallenQuestion = {
  fallen: Due[]
  keep: SettingsPlan
  correct: SettingsPlan | { refusal: Refusal }
}

/** `shownOn` : la « Prochaine dose » que montre le formulaire, quand elle n'est pas la première échéance écrite. */
export type SettingsResult =
  | { plan: SettingsPlan; shownOn?: Day }
  | { question: FallenQuestion; shownOn?: Day }
  | { refusal: Refusal }

function fieldsOf(startsOn: Day, dates: Dates, request: SettingsRequest): SettingFields {
  return {
    startsOn,
    ...dates,
    fallenDosesAnswer: 'unasked',
    endsOn: request.endsOn,
    frequency: request.frequency,
    times: [...request.times],
  }
}

// Q38 : seule une réponse à la question écrit la réponse ; une réécriture la garde.
const rewrite = (current: Setting, setting: SettingFields): SettingsPlan => ({
  action: 'rewrite',
  id: current.id,
  setting: { ...setting, fallenDosesAnswer: current.fallenDosesAnswer },
})

const answered = (plan: SettingsPlan, fallenDosesAnswer: FallenDosesAnswer): SettingsPlan => ({
  ...plan,
  setting: { ...plan.setting, fallenDosesAnswer },
})

// #873 : « Elles n'étaient pas à donner » écrit une ligne par dose que la question a montrée.
function notDue(
  input: TreatmentViewInput,
  plan: SettingsPlan,
  fallen: readonly Due[],
): SettingsPlan {
  const lines = fallen.map(({ settingId, dueOn, dueTime }) =>
    written(input.lines, {
      settingId,
      dueOn,
      dueTime,
      status: 'not-due',
      givenOn: null,
      targetOn: null,
    }),
  )
  return { ...answered(plan, 'not-due'), lines: [...(plan.lines ?? []), ...lines] }
}

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
  const { firstDueOn, gridOriginOn, firstDueChosen } = current
  const dates = { firstDueOn, gridOriginOn, firstDueChosen }
  const shownOn = readAfter(input, draft)(dates).currentDoses[0]?.dueOn ?? firstDueOn
  const asked = request.firstDueOn ?? shownOn
  // R10, #849 : remplacé le jour même à fréquence gardée, un réglage transmet sa date choisie.
  if (
    firstDueChosen &&
    sameFrequency(current.frequency, request.frequency) &&
    (asked === firstDueOn || asked === shownOn)
  ) {
    return planOf(draft, shownOn === firstDueOn ? dates : { ...dates, shownOn })
  }
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
  const { firstDueOn: chosen, ...asked } = request
  const implicit = settingsFor(input, view, current, asked)
  const refusal = isChosen(chosen, implicit) ? chosenRefusal(input, chosen, implicit) : null
  if (refusal !== null) return { refusal }
  const planned = chosen === undefined ? implicit : settingsFor(input, view, current, request)
  const result = sameFrequency(current.frequency, request.frequency)
    ? withChosenDate(input, chosen, planned, implicit)
    : planned
  return endChecked(input, request.endsOn, result)
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
    // R9 : à fréquence gardée et sans dose tombée, les nouvelles heures valent à partir d'aujourd'hui.
    const fromToday =
      sameFrequency(current.frequency, request.frequency) &&
      fallenOf(view, current, today).length === 0
    if (!fromToday) return corrected(input, view, current, request, create)
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
  const { firstDueOn, gridOriginOn, firstDueChosen } = current
  const chosen = request.firstDueOn
  if (chosen === undefined || chosen === firstDueOn) {
    const dates = { firstDueOn, gridOriginOn, firstDueChosen }
    return { plan: rewrite(current, fieldsOf(current.startsOn, dates, request)) }
  }
  if (chosen < today) return { refusal: { reason: 'too-early', earliest: today } }
  const dates = { firstDueOn: chosen, gridOriginOn: chosen, firstDueChosen: true }
  if (fallenOf(view, current, today).length > 0) return { plan: create(dates) }
  const startsOn = chosen < current.startsOn ? chosen : current.startsOn
  return { plan: rewrite(current, fieldsOf(startsOn, dates, request)) }
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
    const question = {
      fallen,
      keep: answered(keep, 'stay-unlogged'),
      correct: notDue(input, correct, fallen),
    }
    const result = fallen.length === 0 ? { plan: correct } : { question }
    const first = 'plan' in result ? correct : keep
    return shownOn === undefined || shownOn === first.setting.firstDueOn
      ? result
      : { ...result, shownOn }
  }
  const neverNoted = !input.lines.some(isTaken)
  const questioned = neverNoted && fallen.length > 0
  const fallback = questioned ? today : later(current.firstDueOn, today)
  const proposal = proposedDates(input, current, asked, fallback, readAfter(input, create))
  if ('refusal' in proposal) return proposal
  const own = (first: Day, firstDueChosen = false): Dates => ({
    firstDueOn: first,
    gridOriginOn: first,
    firstDueChosen,
  })
  // #872 : à fréquence gardée, avec ou sans prise, la correction garde sa grille et ne repart pas
  // d'aujourd'hui ; la date de fin la refuse quand rien ne reste (#806).
  const kept = () =>
    keptCorrection(input, current, request, (dates) =>
      rewrite(current, fieldsOf(current.startsOn, dates, request)),
    )
  // #836 : sans prise, la date de la correction reste une date proposée, jamais une date choisie.
  const fixed = sameFrequency(current.frequency, request.frequency)
    ? { ...kept(), ...(questioned ? { firstDueChosen: false } : {}) }
    : questioned
      ? own(shownFrom(today, readAfter(input, correctFrom)))
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
  return answer(create(own(chosen, true)), correctFrom(own(chosen, true)))
}
