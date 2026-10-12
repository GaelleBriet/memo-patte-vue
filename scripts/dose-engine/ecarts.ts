import {
  orderPeriods,
  treatmentSchedule,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
} from '@/shared/domain/treatment-schedule'

import { plusDays, shifted, type Book } from './carnet'
import { dueKey, HORIZON_DAYS, type Display, type Reading } from './display'
import { inLoop, outsideShiftGaps } from './ecarts-lignes'

/**
 * Familles d'écarts entre le moteur actuel et le modèle de référence. Chacune est décrite, avec son
 * rattachement et un exemple, dans `ecarts-acceptes.md` ; `accepted: false` : défaut sans ticket, à
 * signaler, jamais accepté.
 */
export const FAMILIES = {
  'lignes-du-traitement': { accepted: true },
  'lignes-sans-effet': { accepted: true },
  'prises-du-traitement': { accepted: true },
  'reglage-meme-frequence': { accepted: true },
  'reprise-meme-jour': { accepted: true },
  'mensuel-du-31': { accepted: true },
  'marqueur-reference': { accepted: true },
  'reglage-remplace': { accepted: true },
  'prise-orpheline': { accepted: true },
  'reports-en-boucle': { accepted: true },
  'dose-en-retard': { accepted: true },
  'decalage-hors-grille': { accepted: true },
} as const

export type Family = keyof typeof FAMILIES

export type Verdict = { families: Family[]; unexplained: string[]; accepted: boolean }

type Period = TreatmentPeriodInput

const dayOf = (key: string) => key.slice(0, 10)
const isNote = ({ status }: TreatmentDoseInput) => status === 'given' || status === 'missed'
const sameFrequency = (a: Period, b: Period) =>
  a.frequency.value === b.frequency.value && a.frequency.unit === b.frequency.unit
const sameTimes = (a: Period, b: Period) =>
  [...a.times].sort().join() === [...b.times].sort().join()

function pendingOf(display: Display): Set<string> {
  return new Set([...display.unlogged, ...display.current, ...display.upcoming])
}

// Comme le moteur actuel : une période vaut de son début au début de la suivante ou à son arrêt.
function periodsOf(book: Book) {
  const ordered = orderPeriods(book.periods)
  const closing = (period: Period) => {
    const next = ordered[ordered.indexOf(period) + 1]
    return (
      [period.stoppedOn, next?.startsOn ?? null].filter((day) => day !== null).sort()[0] ?? null
    )
  }
  const byId = (id: string) => ordered.find((period) => period.id === id)
  const outside = (periodId: string, day: string) => {
    const period = byId(periodId)
    const close = period === undefined ? null : closing(period)
    return period === undefined || day < period.startsOn || (close !== null && day >= close)
  }
  return { ordered, byId, outside, closing }
}

// R1, R8 : les périodes de l'épisode en cours avant `index`, depuis le dernier arrêt.
function episodeBefore(ordered: Period[], index: number): Period[] {
  const stops = ordered.slice(0, index).map(({ stoppedOn }, at) => (stoppedOn === null ? -1 : at))
  return ordered.slice(Math.max(...stops) + 1, index)
}

function onLattice(origin: string, period: Period, day: string): boolean {
  let reached = origin
  for (let step = 1; reached < day; step += 1) reached = shifted(origin, period.frequency, step)
  return reached === day
}

// La grille d'une période comme le moteur actuel la lit : sa première échéance, puis la grille de
// `referenceOn` quand elle la suit (G23) ou passe par elle, sinon celle de la première échéance.
function ownGrid(period: Period, day: string): boolean {
  const { firstDueOn, referenceOn } = period
  if (day <= firstDueOn) return day === firstDueOn
  if (referenceOn > firstDueOn) return day >= referenceOn && onLattice(referenceOn, period, day)
  const origin = onLattice(referenceOn, period, firstDueOn) ? referenceOn : firstDueOn
  return onLattice(origin, period, day)
}

// R3, R6 : la grille en vigueur avant le changement, celle du premier réglage d'une suite de même
// fréquence, chaque décalage la faisant repartir de son ancrage.
function inForceGrid(book: Book, before: Period[], day: string): boolean {
  const last = before.at(-1)
  if (last === undefined) return false
  let first = before.length - 1
  while (first > 0 && sameFrequency(before[first - 1]!, last)) first -= 1
  const ids = new Set(before.slice(first).map(({ id }) => id))
  const turn = book.doses
    .filter((line) => line.status === 'shift' && ids.has(line.periodId) && line.dueOn < day)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .at(-1)
  const head = before[first]!
  if (turn === undefined) {
    return ownGrid(head, day) || (day < head.firstDueOn && onLattice(day, head, head.firstDueOn))
  }
  return day > turn.nextDueDate && onLattice(turn.nextDueDate, last, day)
}

// Pourquoi ce jour diffère : chaque famille dit ce que le moteur actuel fait autrement que R1 à R12.
function familiesOn(book: Book, day: string, stale: Set<string>): Family[] {
  const { ordered, outside } = periodsOf(book)
  const found = new Set<Family>()
  for (const line of book.doses) {
    const touches =
      line.status === 'shift'
        ? line.dueOn < day
        : line.status === 'postponed'
          ? line.dueOn === day || line.nextDueDate === day
          : line.dueOn === day && isNote(line)
    if (!touches) continue
    if (stale.has(line.id)) found.add('lignes-sans-effet')
    if (line.status === 'postponed' && inLoop(book, line)) found.add('reports-en-boucle')
    const across =
      outside(line.periodId, line.dueOn) ||
      (line.status === 'postponed' && outside(line.periodId, line.nextDueDate))
    if (across) found.add(isNote(line) ? 'prises-du-traitement' : 'lignes-du-traitement')
  }
  ordered.forEach((period, index) => {
    const previous = ordered[index - 1]
    if (previous === undefined) return
    if (outside(period.id, day) && day !== period.firstDueOn) return
    // Plan §3.1 : `referenceOn` marquait une première échéance hors grille (G23), une journée entamée
    // (G24) ou une journée qui ne couvre rien (Q8) ; le moteur v2 n'a plus ces marqueurs.
    const [low, high] = [period.firstDueOn, period.referenceOn].sort()
    if (low !== high && low! <= day && day <= high!) found.add('marqueur-reference')
    // R10 : remplacé le jour même sans prise, le réglage précédent ne compte plus.
    const replaced =
      previous.startsOn === period.startsOn &&
      previous.stoppedOn === null &&
      !book.doses.some(
        (line) => line.periodId === previous.id && (isNote(line) || line.status === 'postponed'),
      )
    if (replaced) found.add('reglage-remplace')
    if (previous.stoppedOn !== null) {
      if (
        period.startsOn === day &&
        book.doses.some((line) => isNote(line) && line.dueOn === day)
      ) {
        found.add('reprise-meme-jour')
      }
      return
    }
    if (!sameTimes(previous, period) && (day === period.startsOn || day === period.firstDueOn)) {
      found.add('prises-du-traitement')
    }
    if (!sameFrequency(previous, period) || day < period.startsOn) return
    const before = episodeBefore(ordered, index)
    if (day <= period.firstDueOn || inForceGrid(book, before, day) !== ownGrid(period, day)) {
      found.add('reglage-meme-frequence')
    }
    // R3 : un mensuel du 31 repris d'un jour borné (le 30 avr.) glisse au 30 dans le moteur actuel.
    const monthEnd = (date: string) => Number(date.slice(8)) >= 28
    if (period.frequency.unit === 'month' && monthEnd(period.referenceOn) && monthEnd(day)) {
      found.add('mensuel-du-31')
    }
  })
  return [...found]
}

// R4 : l'échéance `key`, due pour le moteur actuel, est couverte par une prise d'une échéance plus
// tôt (jour et heure) à moins d'un pas, sortie du calendrier du second moteur : sans ces prises, il la
// redemande. Une prise qui pourrait battre un report, ou qui vise une journée de sa grille le jour où
// son réglage cède la place (R1 : elle garde son échéance), reste dans le carnet relu.
function coveredByOrphan(book: Book, key: string, reread: Reread): boolean {
  const day = dayOf(key)
  const { ordered, byId, closing } = periodsOf(book)
  const atBoundary = ({ periodId, dueOn }: TreatmentDoseInput) => {
    const period = byId(periodId)
    if (period === undefined || closing(period) !== dueOn) return false
    const run = [...episodeBefore(ordered, ordered.indexOf(period)), period]
    return inForceGrid(book, run, dueOn)
  }
  // R1, R8 : un report ne se bat qu'avec une prise de son épisode.
  const episodeOf = (periodId: string) => {
    const period = byId(periodId)
    if (period === undefined) return periodId
    const index = ordered.indexOf(period)
    return (episodeBefore(ordered, index)[0] ?? period).id
  }
  const reported = new Set(
    book.doses
      .filter(({ status, dueOn, nextDueDate }) => status === 'postponed' && nextDueDate !== dueOn)
      .map(({ periodId, dueOn, dueTime }) => `${episodeOf(periodId)} ${dueOn} ${dueTime}`),
  )
  const near = (note: TreatmentDoseInput) =>
    isNote(note) &&
    dueKey(note) < key &&
    !atBoundary(note) &&
    !reported.has(`${episodeOf(note.periodId)} ${note.dueOn} ${note.dueTime}`) &&
    book.periods.some(
      ({ id, frequency }) => id === note.periodId && shifted(note.dueOn, frequency, 1) > day,
    )
  if (!book.doses.some(near)) return false
  const until = [plusDays(book.today, HORIZON_DAYS), day].sort()[1]!
  const without = reread({ ...book, doses: book.doses.filter((line) => !near(line)) }, until)
  return !('error' in without) && pendingOf(without).has(key)
}

/** Relit un carnet par le second moteur, échéances à venir lues jusqu'à `until`. */
export type Reread = (book: Book, until: string) => Reading

/** Rattache un écart aux familles connues, jour par jour ; un jour sans famille reste inexpliqué. */
export function verdictOf(
  book: Book,
  actual: Reading,
  reference: Reading,
  reread: Reread,
): Verdict {
  if ('error' in actual || 'error' in reference) {
    return { families: [], unexplained: ['un moteur lève'], accepted: false }
  }
  const stale = new Set(treatmentSchedule(book).staleDoseIds)
  const until = plusDays(book.today, HORIZON_DAYS)
  const [a, b] = [pendingOf(actual), pendingOf(reference)]
  const near = [...a, ...b].filter((key) => a.has(key) !== b.has(key) && dayOf(key) <= until)
  // Au-delà de l'horizon, seule la dose du moment est lue : elle dit où le calendrier diverge.
  const far = [...actual.current, ...reference.current]
    .filter(
      (key) =>
        actual.current.includes(key) !== reference.current.includes(key) && dayOf(key) > until,
    )
    .sort()
    .slice(0, 1)
  const differing = near.length > 0 ? near : far
  const families = new Set<Family>()
  const unexplained: string[] = []
  const lateKept = keepsLateDose(book, reference)
  for (const key of new Set(differing)) {
    const found = familiesOn(book, dayOf(key), stale)
    if (a.has(key) && !b.has(key) && coveredByOrphan(book, key, reread))
      found.push('prise-orpheline')
    const current = actual.current.includes(key) || reference.current.includes(key)
    if (found.length === 0 && lateKept && current) found.push('dose-en-retard')
    found.forEach((family) => families.add(family))
    if (found.length === 0) unexplained.push(key)
  }
  if (differing.length === 0) splitFamilies(book, actual, reference, stale, families, unexplained)
  const rest = outsideShiftGaps(book, reference, unexplained)
  if (rest.length < unexplained.length) families.add('decalage-hors-grille')
  const list = [...families]
  return {
    families: list,
    unexplained: rest,
    accepted: rest.length === 0 && list.every((family) => FAMILIES[family].accepted),
  }
}

// R9, Q-retard : à fréquence gardée depuis la journée de la dose du moment du second moteur, elle y
// reste en retard ; le moteur actuel la range à renseigner.
function keepsLateDose(book: Book, reference: Display): boolean {
  const day = reference.current[0]?.slice(0, 10)
  const { ordered } = periodsOf(book)
  const last = ordered.at(-1)
  if (day === undefined || last === undefined || day >= last.startsOn || day >= book.today) {
    return false
  }
  const run = [...episodeBefore(ordered, ordered.length - 1), last]
  const from = run.filter(({ startsOn }) => startsOn <= day).length - 1
  return from >= 0 && run.slice(from).every((period) => sameFrequency(period, last))
}

// Mêmes échéances, autre dose du moment : une journée entre les deux doses du moment n'est tombée
// que pour l'un des deux moteurs.
function splitFamilies(
  book: Book,
  actual: Display,
  reference: Display,
  stale: Set<string>,
  families: Set<Family>,
  unexplained: string[],
): void {
  const firsts = [actual.current[0], reference.current[0], book.today].filter(
    (key) => key !== undefined,
  )
  if (keepsLateDose(book, reference)) families.add('dose-en-retard')
  const from = firsts.map(dayOf).sort()[0]!
  const days = new Set(
    book.doses
      .flatMap((line) => [line.dueOn, line.nextDueDate])
      .filter((day) => day > from && day <= book.today),
  )
  const found = [...days].flatMap((day) => familiesOn(book, day, stale))
  found.forEach((family) => families.add(family))
  if (found.length > 0 || families.has('dose-en-retard')) return
  const orphan = book.doses.some(
    (line) => isNote(line) && line.dueOn > from && line.dueOn <= book.today,
  )
  if (orphan) families.add('prise-orpheline')
  else unexplained.push('dose du moment')
}
