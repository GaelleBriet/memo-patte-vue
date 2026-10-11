import { keyOf, plusDays } from '../grid'
import { isNote } from '../lines'
import { episodesOf } from '../settings'
import type {
  Day,
  Due,
  FollowedReport,
  GestureOutcome,
  Line,
  LineChange,
  Refusal,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied } from './changes'
import { arrivesOnOrigin, strandsNote } from './reports'

/** G18 : le décalage d'une dose avancée se pose sur sa journée d'origine, sinon sur sa journée. */
export function shiftDayOf(view: TreatmentView, due: Pick<Due, 'dueOn'>): Day {
  const advanced = view.history.find(
    ({ line, effect }) =>
      line.status === 'postponed' &&
      effect.kind === 'moves' &&
      line.targetOn === due.dueOn &&
      line.targetOn < line.dueOn,
  )
  return advanced?.line.dueOn ?? due.dueOn
}

/** R6, G7, TR-32 : une prise, ou une ligne de décalage, ou un report, existe après cette journée dans sa période. */
export function linesAfter(
  input: Pick<TreatmentViewInput, 'settings' | 'lines'>,
  from: Pick<Due, 'settingId' | 'dueOn'>,
  ignored: ReadonlySet<string>,
): { notes: Line[]; others: Line[] } {
  const elsewhere = new Set(
    episodesOf(input.settings)
      .filter((episode) => !episode.some(({ id }) => id === from.settingId))
      .flatMap((episode) => episode.map(({ id }) => id)),
  )
  const later = input.lines.filter(
    (line) =>
      !ignored.has(line.id) &&
      !elsewhere.has(line.settingId) &&
      line.dueOn > from.dueOn &&
      line.status !== 'extra',
  )
  return { notes: later.filter(isNote), others: later.filter((line) => !isNote(line)) }
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
  changes: readonly LineChange[],
): Refusal | null {
  if (arrivesOnOrigin(after, changes)) return { reason: 'report-loop' }
  return strandsNote(before, after) ? { reason: 'later-dose' } : null
}

export function outcome(
  input: TreatmentViewInput,
  changes: LineChange[],
  extra: Partial<Omit<GestureOutcome, 'changes'>> = {},
): GestureOutcome | { refusal: Refusal } {
  const before = buildView(input)
  const after = buildView(applied(input, changes))
  const refusal = harm(before, after, changes)
  if (refusal !== null) return { refusal }
  return {
    changes,
    offersShift: extra.offersShift ?? false,
    lostToEnd: extra.lostToEnd ?? [],
    newlyDue: newlyDue(before, after, input.today),
    followed: extra.followed ?? ([] as FollowedReport[]),
  }
}
