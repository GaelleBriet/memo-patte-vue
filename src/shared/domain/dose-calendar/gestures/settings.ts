import { hoursOf, isOnGrid, later, plusDays, sameFrequency, stepped } from '../grid'
import { isNote } from '../lines'
import { episodesOf, hasNotes } from '../settings'
import type {
  Day,
  Due,
  Frequency,
  Refusal,
  Setting,
  SettingFields,
  SettingsPlan,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { settingsApplied } from './changes'

/** « Modifier » : les nouveaux réglages ; `firstDueOn` : la « Prochaine dose » choisie, sinon la proposée. */
export type SettingsRequest = {
  frequency: Frequency
  times: readonly string[]
  endsOn: Day | null
  firstDueOn?: Day
}

/** Q38 : sans prise, des échéances tombées ; « Elles restent à renseigner » ou « Elles n'étaient pas à donner ». */
export type FallenQuestion = { fallen: Due[]; keep: SettingsPlan; correct: SettingsPlan }

export type SettingsResult =
  { plan: SettingsPlan } | { question: FallenQuestion } | { refusal: Refusal }

const NEXT_DAYS = 800

const sameHours = (a: readonly string[], b: readonly string[]) =>
  hoursOf(a).join() === hoursOf(b).join()

// R9, R12 : à fréquence gardée, la prochaine journée du carnet une fois le réglage écrit, dose du
// moment en retard comprise ; la première échéance joue sur la lecture (heures changées, reprise).
function keptFirstDue(today: Day, readWith: (firstDueOn: Day) => TreatmentView): Day {
  let day = today
  for (let round = 0; round < 3; round += 1) {
    const view = readWith(day)
    const late = view.currentDoses.find(({ dueOn }) => dueOn < today)
    const next = late?.dueOn ?? view.slots(today, plusDays(today, NEXT_DAYS))[0]?.due.dueOn ?? today
    if (next === day) return day
    day = next
  }
  return day
}

const isNoted = (state: string) => state === 'given' || state === 'missed' || state === 'covered'

// R9.1 : aujourd'hui est une journée d'échéance qui a encore des heures à donner ; partie avec un
// report, elle n'en a plus (Q-#744 : le rythme part alors de l'arrivée, R9.2).
function dueToday(view: TreatmentView, today: Day): boolean {
  return view.slots(today, today).some(({ state }) => state === 'pending')
}

// R9.2 : la prochaine journée, entamée en avance ou arrivée d'un report, garde son jour.
function heldNextDay(view: TreatmentView, today: Day): Day | undefined {
  const tomorrow = plusDays(today, 1)
  const day = view.slots(tomorrow, plusDays(today, NEXT_DAYS))[0]?.due.dueOn
  if (day === undefined) return undefined
  const started = view.slots(day, day).some(({ state }) => isNoted(state))
  const arrival = view.history.some(
    ({ effect }) => effect.kind === 'moves' && effect.arrival === day,
  )
  return started || arrival ? day : undefined
}

// R9.3 (Q7) : la dernière journée passée qui a une prise, plus la nouvelle fréquence.
function lastNotedDay(view: TreatmentView, today: Day, from: Day): Day | undefined {
  return view
    .slots(from, today)
    .filter(({ state }) => isNoted(state))
    .at(-1)?.due.dueOn
}

/** R9 : la première échéance proposée quand la fréquence change, et son origine. */
function changedFirstDue(
  input: TreatmentViewInput,
  view: TreatmentView,
  frequency: Frequency,
  fallback: Day,
): Day {
  const { today } = input
  if (dueToday(view, today)) return today
  const held = heldNextDay(view, today)
  if (held !== undefined) return held
  const from = input.settings.map(({ startsOn }) => startsOn).sort()[0] ?? today
  const last = lastNotedDay(view, today, from)
  return last === undefined ? fallback : later(stepped(last, frequency, 1), today)
}

type Dates = Pick<SettingFields, 'firstDueOn' | 'gridOriginOn'>

// R6, R12 : un décalage resté d'un réglage remplacé peut faire repartir le nouveau rythme ; la date
// proposée est la première journée que la fiche montrera.
function shownFrom(day: Day, readWith: (dates: Dates) => TreatmentView): Day {
  return (
    readWith({ firstDueOn: day, gridOriginOn: day }).slots(day, plusDays(day, NEXT_DAYS))[0]?.due
      .dueOn ?? day
  )
}

// R3, R9 : la date proposée, ou choisie, et l'origine de la grille ; héritée à fréquence gardée.
function proposedDates(
  before: TreatmentViewInput,
  previous: Setting | null,
  request: SettingsRequest,
  fallback: Day,
  readWith: (dates: Dates) => TreatmentView,
): Dates | { refusal: Refusal } {
  const kept = previous !== null && sameFrequency(previous.frequency, request.frequency)
  const proposed = kept
    ? keptFirstDue(before.today, (firstDueOn) => readWith({ firstDueOn, gridOriginOn: null }))
    : previous === null
      ? fallback
      : shownFrom(changedFirstDue(before, buildView(before), request.frequency, fallback), readWith)
  const chosen = request.firstDueOn
  if (chosen === undefined || chosen === proposed) {
    return { firstDueOn: proposed, gridOriginOn: kept ? null : proposed }
  }
  if (chosen < before.today) return { refusal: { reason: 'too-early', earliest: before.today } }
  return { firstDueOn: chosen, gridOriginOn: chosen }
}

function fieldsOf(startsOn: Day, dates: Dates, request: SettingsRequest): SettingFields {
  return {
    startsOn,
    ...dates,
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
  return 'refusal' in proposal ? proposal : { plan: draft(proposal) }
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
  const { today } = input
  const view = buildView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped') {
    throw new RangeError('Aucun réglage en cours : « Reprendre » ouvre le suivant')
  }
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
  return 'refusal' in proposal ? proposal : { plan: create(proposal) }
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
  const answer = (keep: SettingsPlan, correct: SettingsPlan): SettingsResult =>
    fallen.length === 0 ? { plan: correct } : { question: { fallen, keep, correct } }
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
  const implicit = answer(create(proposal), correctFrom(fixed))
  // Q38 : la date que montre le formulaire, passée telle quelle, n'est pas une date choisie.
  const shown = fallen.length === 0 ? fixed : proposal
  if (chosen === undefined || chosen === shown.firstDueOn) return implicit
  if (chosen < today) return { refusal: { reason: 'too-early', earliest: today } }
  return answer(create(own(chosen)), correctFrom(own(chosen)))
}
