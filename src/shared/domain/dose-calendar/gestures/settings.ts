import { hoursOf, later, plusDays, sameFrequency, stepped } from '../grid'
import { isNote } from '../lines'
import { hasNotes } from '../settings'
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

/** R9 : à fréquence gardée, la prochaine journée du calendrier en vigueur, dose du moment en retard comprise. */
export function keptFirstDue(view: TreatmentView, today: Day): Day {
  const late = view.currentDoses.find(({ dueOn }) => dueOn < today)
  if (late !== undefined) return late.dueOn
  return view.slots(today, plusDays(today, NEXT_DAYS))[0]?.due.dueOn ?? today
}

const isNoted = (state: string) => state === 'given' || state === 'missed' || state === 'covered'

// R9.1 : aujourd'hui a encore des heures à donner, ou rien n'y est noté alors qu'une dose y était due.
function dueToday(input: TreatmentViewInput, view: TreatmentView): boolean {
  const { today } = input
  const slots = view.slots(today, today)
  if (slots.some(({ state }) => state === 'pending')) return true
  if (slots.some(({ state }) => isNoted(state))) return false
  if (input.lines.some((line) => isNote(line) && line.dueOn === today)) return false
  const setting = view.settingAt(today)
  return (
    setting !== undefined &&
    hoursOf(setting.times).some((dueTime) => view.dueState({ dueOn: today, dueTime }) === 'moved')
  )
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
  if (dueToday(input, view)) return today
  const held = heldNextDay(view, today)
  if (held !== undefined) return held
  const from = input.settings.map(({ startsOn }) => startsOn).sort()[0] ?? today
  const last = lastNotedDay(view, today, from)
  return last === undefined ? fallback : later(stepped(last, frequency, 1), today)
}

type Dates = Pick<SettingFields, 'firstDueOn' | 'gridOriginOn'>

// R3, R9 : la date proposée, ou choisie, et l'origine de la grille ; héritée à fréquence gardée.
function proposedDates(
  input: TreatmentViewInput,
  previous: Setting | null,
  request: SettingsRequest,
  fallback: Day,
): Dates | { refusal: Refusal } {
  const view = buildView(input)
  const kept = previous !== null && sameFrequency(previous.frequency, request.frequency)
  const proposed = kept
    ? keptFirstDue(view, input.today)
    : previous === null
      ? fallback
      : changedFirstDue(input, view, request.frequency, fallback)
  const chosen = request.firstDueOn
  if (chosen === undefined || chosen === proposed) {
    return { firstDueOn: proposed, gridOriginOn: kept ? null : proposed }
  }
  if (chosen < input.today) return { refusal: { reason: 'too-early', earliest: input.today } }
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

// R10 : le réglage ouvert aujourd'hui, encore sans prise, est remplacé ; il est calculé comme s'il
// n'avait jamais existé.
function replaced(
  input: TreatmentViewInput,
  current: Setting,
  request: SettingsRequest,
): SettingsResult {
  const base = { ...input, settings: input.settings.filter(({ id }) => id !== current.id) }
  const before = buildView(base)
  const previous = before.phase === 'stopped' ? null : before.currentSetting
  const dates = proposedDates(base, previous, request, current.firstDueOn)
  if ('refusal' in dates) return dates
  return { plan: rewrite(current, fieldsOf(current.startsOn, dates, request)) }
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
    const { firstDueOn, gridOriginOn } = current
    const kept = { firstDueOn, gridOriginOn }
    if (sameRhythm) return { plan: rewrite(current, fieldsOf(current.startsOn, kept, request)) }
    if (current.startsOn === today) return replaced(input, current, request)
    return corrected(input, view, current, request, create)
  }
  const dates = proposedDates(input, current, request, today)
  return 'refusal' in dates ? dates : { plan: create(dates) }
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
  const fallen = fallenOf(view, current, today)
  const neverNoted = !input.lines.some(isNote)
  const asked = neverNoted && fallen.length > 0
  const fallback = asked ? today : later(current.firstDueOn, today)
  const dates = proposedDates(input, current, request, fallback)
  if ('refusal' in dates) return dates
  const first = request.firstDueOn ?? (asked ? today : later(dates.firstDueOn, today))
  const startsOn = first < current.startsOn ? first : current.startsOn
  const correct = rewrite(
    current,
    fieldsOf(startsOn, { firstDueOn: first, gridOriginOn: first }, request),
  )
  if (fallen.length === 0) return { plan: correct }
  return { question: { fallen, keep: create(dates), correct } }
}
