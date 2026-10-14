import { later, plusDays, sameFrequency, stepped } from '../grid'
import type { Day, Frequency, Refusal, Setting, SettingFields, TreatmentViewInput } from '../types'
import { buildView, type TreatmentView } from '../view'

/** « Modifier » : les nouveaux réglages ; `firstDueOn` : la « Prochaine dose » choisie, sinon la proposée. */
export type SettingsRequest = {
  frequency: Frequency
  times: readonly string[]
  endsOn: Day | null
  firstDueOn?: Day
}

export const NEXT_DAYS = 800

// R9, R12 : à fréquence gardée, la prochaine journée du carnet une fois le réglage écrit, dose du
// moment en retard comprise ; l'origine héritée, la première échéance ne change pas les journées.
function keptFirstDue(today: Day, view: TreatmentView): Day {
  const late = view.currentDoses.find(({ dueOn }) => dueOn < today)
  return late?.dueOn ?? view.slots(today, plusDays(today, NEXT_DAYS))[0]?.due.dueOn ?? today
}

const isNoted = (state: string) => state === 'given' || state === 'missed' || state === 'covered'

// R9.1 : aujourd'hui est une journée d'échéance qui a encore des heures à donner ; partie avec un
// report, elle n'en a plus (Q-#744 : le rythme part alors de l'arrivée, R9.2).
function dueToday(view: TreatmentView, today: Day): boolean {
  return view.slots(today, today).some(({ state }) => state === 'pending')
}

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

// R9.3, #799 : une journée sortie du calendrier par le réglage suivant garde ses prises (R4), elle
// reste la dernière journée d'échéance passée quel que soit le jour de la correction.
function lastNotedDay(view: TreatmentView, today: Day): Day | undefined {
  return view.history
    .flatMap(({ effect }) => (effect.kind === 'covers' ? [effect.key.slice(0, 10)] : []))
    .filter((day) => day <= today)
    .sort()
    .at(-1)
}

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
  const last = lastNotedDay(view, today)
  return last === undefined ? fallback : later(stepped(last, frequency, 1), today)
}

export type Dates = Pick<SettingFields, 'firstDueOn' | 'gridOriginOn' | 'firstDueChosen'>

/** `shownOn` : la « Prochaine dose » montrée quand la première échéance écrite est déjà toute notée (R4). */
export type Proposal = Dates & { shownOn?: Day }

// R9, R12 : la première dose encore à donner que la fiche montrera ; une journée proposée déjà toute
// notée garde son rôle (traduction des heures, R4 ; départ du rythme, R9.2), la fiche montre la suivante.
export function shownDay(dates: Dates, readWith: (dates: Dates) => TreatmentView): Day {
  const { firstDueOn } = dates
  const view = readWith(dates)
  return (
    view
      .slots(firstDueOn, view.lastDueDay ?? plusDays(firstDueOn, NEXT_DAYS))
      .find(({ state }) => state === 'pending')?.due.dueOn ?? firstDueOn
  )
}

// R6, R12 : un décalage resté d'un réglage remplacé peut faire repartir le nouveau rythme ; la date
// proposée est la première journée que la fiche montrera.
export function shownFrom(day: Day, readWith: (dates: Dates) => TreatmentView): Day {
  return (
    readWith({ firstDueOn: day, gridOriginOn: day, firstDueChosen: false }).slots(
      day,
      plusDays(day, NEXT_DAYS),
    )[0]?.due.dueOn ?? day
  )
}

export function proposedDates(
  before: TreatmentViewInput,
  previous: Setting | null,
  request: SettingsRequest,
  fallback: Day,
  readWith: (dates: Dates) => TreatmentView,
): Proposal | { refusal: Refusal } {
  const kept = previous !== null && sameFrequency(previous.frequency, request.frequency)
  const proposed = kept
    ? keptFirstDue(
        before.today,
        readWith({ firstDueOn: before.today, gridOriginOn: null, firstDueChosen: false }),
      )
    : previous === null
      ? fallback
      : shownFrom(changedFirstDue(before, buildView(before), request.frequency, fallback), readWith)
  const dates = {
    firstDueOn: proposed,
    gridOriginOn: kept ? null : proposed,
    firstDueChosen: false,
  }
  const shown = shownDay(dates, readWith)
  const chosen = request.firstDueOn
  if (chosen === undefined || chosen === proposed || chosen === shown) {
    return shown === proposed ? dates : { ...dates, shownOn: shown }
  }
  if (chosen < before.today) return { refusal: { reason: 'too-early', earliest: before.today } }
  return { firstDueOn: chosen, gridOriginOn: chosen, firstDueChosen: true }
}
