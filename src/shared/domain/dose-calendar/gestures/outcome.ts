import { keyOf, plusDays } from '../grid'
import { isAdvanced, isTaken } from '../lines'
import { episodeIdsOf } from '../settings'
import type {
  Day,
  Due,
  FollowedReport,
  GestureOutcome,
  Line,
  GestureResult,
  LineChange,
  Refusal,
  Setting,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied } from './changes'
import { arrivesOnOrigin, brokenReports, followed, strandsNote } from './reports'

/** G18 : le décalage d'une dose avancée se pose sur sa journée d'origine, sinon sur sa journée. */
export function shiftDayOf(view: TreatmentView, due: Pick<Due, 'dueOn'>): Day {
  const advanced = view.history.find(
    ({ line, effect }) =>
      isAdvanced(line) && effect.kind === 'moves' && line.targetOn === due.dueOn,
  )
  return advanced?.line.dueOn ?? due.dueOn
}

/** Q2 c : la dose de ce jour est l'arrivée d'un report écrit sans « Décaler aussi les doses suivantes ». */
export function movedAlone(view: TreatmentView, lines: readonly Line[], day: Day): boolean {
  return view.history.some(
    ({ line, effect }) =>
      line.status === 'postponed' &&
      effect.kind === 'moves' &&
      effect.arrival === day &&
      !lines.some(({ status, dueOn }) => status === 'shift' && dueOn === line.dueOn),
  )
}

/** G7, G8 : une dose avancée (report ou décalage vers une date plus tôt) vit à son arrivée. */
export const livesOn = ({ dueOn, targetOn }: Pick<Line, 'dueOn' | 'targetOn'>): Day =>
  targetOn !== null && targetOn < dueOn ? targetOn : dueOn

/**
 * R6, G7, TR-32 : une prise, ou une ligne de décalage, ou un report, existe après cette journée dans sa
 * période ; une ligne « pas à donner » ne compte pas (#873).
 */
export function linesAfter(
  input: Pick<TreatmentViewInput, 'settings' | 'lines'>,
  from: Pick<Due, 'settingId' | 'dueOn'>,
  ignored: ReadonlySet<string>,
  dayOf: (line: Line) => Day = ({ dueOn }) => dueOn,
): { notes: Line[]; others: Line[] } {
  const episode = episodeIdsOf(input.settings, from.settingId)
  const later = input.lines.filter(
    (line) =>
      !ignored.has(line.id) &&
      (episode.size === 0 || episode.has(line.settingId)) &&
      dayOf(line) > from.dueOn &&
      line.status !== 'extra' &&
      line.status !== 'not-due',
  )
  return { notes: later.filter(isTaken), others: later.filter((line) => !isTaken(line)) }
}

const overdue = (view: TreatmentView, today: Day): Due[] => [
  ...view.unloggedDoses,
  ...view.currentDoses.filter(({ dueOn }) => dueOn < today),
]

/** G21 : les échéances passées qui deviennent à renseigner ou en retard, et seulement elles. */
export function newlyDue(before: TreatmentView, after: TreatmentView, today: Day): Due[] {
  const known = new Set(overdue(before, today).map((due) => keyOf(due.dueOn, due.dueTime)))
  return overdue(after, today).filter((due) => !known.has(keyOf(due.dueOn, due.dueTime)))
}

/** G20, Q4 : les journées que le décalage fait sortir de la date de fin, comptées après ce jour. */
export function lostToEnd(
  input: TreatmentViewInput,
  kept: readonly LineChange[],
  shifted: readonly LineChange[],
  after: Day,
): Day[] {
  const view = buildView(input)
  const end = view.currentSetting?.endsOn ?? null
  if (end === null) return []
  const daysLeft = (changes: readonly LineChange[]) => [
    ...new Set(
      buildView(applied(input, changes))
        .slots(plusDays(after, 1), end)
        .filter(({ state }) => state === 'pending')
        .map(({ due }) => due.dueOn),
    ),
  ]
  const stays = daysLeft(kept)
  return stays.slice(daysLeft(shifted).length)
}

/** R6, R7 par construction : un geste ne laisse jamais une prise sans échéance ni deux reports en boucle. */
export function harm(
  before: TreatmentView,
  after: TreatmentView,
  settings: readonly Setting[],
  changes: readonly LineChange[],
): Refusal | null {
  if (arrivesOnOrigin(after, settings, changes)) return { reason: 'report-loop' }
  return strandsNote(before, after) ? { reason: 'later-dose' } : null
}

export function outcome(
  input: TreatmentViewInput,
  changes: LineChange[],
  extra: Partial<Omit<GestureOutcome, 'changes'>> = {},
): GestureOutcome | { refusal: Refusal } {
  const before = buildView(input)
  const after = buildView(applied(input, changes))
  const refusal = harm(before, after, input.settings, changes)
  if (refusal !== null) return { refusal }
  return {
    changes,
    offersShift: extra.offersShift ?? false,
    lostToEnd: extra.lostToEnd ?? [],
    newlyDue: newlyDue(before, after, input.today),
    followed: extra.followed ?? ([] as FollowedReport[]),
  }
}

export type Details = { offersShift: boolean; lostToEnd: Day[] }

// G19, #786 : chaque report seul qui ne tient plus suit le geste, sinon il est refusé ; un seul
// chemin pour « Fait à une autre date » et pour la correction de date.
export function withFollowed(
  input: TreatmentViewInput,
  written: LineChange[],
  from: Day,
  details: Details,
): GestureResult {
  const brokenWith = (changes: LineChange[]) => brokenReports(input, applied(input, changes), from)
  const broken = brokenWith(written)
  if (broken.length === 0) return outcome(input, written, details)
  let changes = written
  const follows: FollowedReport[] = []
  for (const report of broken) {
    const carnet = applied(input, changes)
    const next = followed(
      carnet,
      carnet.lines.find(({ id }) => id === report.id)!,
      from,
    )
    if (next === null) return { refusal: { reason: 'stuck-report', on: report.targetOn! } }
    changes = [...changes, next.change]
    follows.push({ from: report.targetOn!, to: next.to })
  }
  if (brokenWith(changes).length > 0) {
    return { refusal: { reason: 'stuck-report', on: broken[0]!.targetOn! } }
  }
  return outcome(input, changes, { ...details, followed: follows })
}
