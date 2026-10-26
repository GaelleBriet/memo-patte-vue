import { chosenAtOf, keyOf } from '../grid'
import { isMoreRecent } from '../lines'
import type {
  Day,
  Due,
  Line,
  LineChange,
  LineFields,
  Refusal,
  Setting,
  TreatmentViewInput,
} from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied, shiftOfDay, without } from './changes'
import { strandsNote } from './reports'

export const reportsOf = (view: TreatmentView, episode: ReadonlySet<string>): Line[] =>
  view.history
    .filter(
      ({ line, effect }) =>
        line.status === 'postponed' && effect.kind === 'moves' && episode.has(line.settingId),
    )
    .map(({ line }) => line)

export const opensRhythm = (view: TreatmentView, report: Line): boolean =>
  view.history.some(
    ({ line, effect }) => line.id === report.id && effect.kind === 'moves' && effect.opensRhythm,
  )

// #989, R7 : une heure suivante de l'arrivée d'un décalage part de cette journée, comme d'une journée propre.
function leavesTurnedArrival(
  input: TreatmentViewInput,
  view: TreatmentView,
  report: Line,
  due: Due,
): boolean {
  const first = view.slots(due.dueOn, due.dueOn).find(({ state }) => state === 'pending')
  return (
    report.targetOn === due.dueOn &&
    shiftOfDay(input.lines, report.dueOn)?.targetOn === report.targetOn &&
    first !== undefined &&
    first.due.dueTime !== due.dueTime &&
    !opensRhythm(view, report) &&
    !input.settings.some(
      ({ firstDueChosen, firstDueOn }) => firstDueChosen && firstDueOn === report.targetOn,
    )
  )
}

/**
 * R7 : le report que le déplacement de la dose réécrit, parti de sa journée ou arrivé sur elle ;
 * `carried` : emmené par un réglage (#796), il reprend toujours le report de son arrivée.
 */
export function reportToRewrite(
  input: TreatmentViewInput,
  view: TreatmentView,
  episode: ReadonlySet<string>,
  due: Due,
  notedOn: (day: Day) => boolean,
  carried: boolean,
): Line | undefined {
  const found = reportsOf(view, episode)
    .filter(
      (report) =>
        (report.targetOn === due.dueOn && !notedOn(due.dueOn)) || report.dueOn === due.dueOn,
    )
    .at(-1)
  if (found === undefined || carried) return found
  return leavesTurnedArrival(input, view, found, due) ? undefined : found
}

/** Q51 : un autre report en vigueur arrivé le même jour, qu'un geste sur celui-ci séparerait. */
export function sharedArrival(
  view: TreatmentView,
  report: Line,
  ignored: ReadonlySet<string> = new Set(),
): Line | undefined {
  return view.history.find(
    ({ line, effect }) =>
      line.status === 'postponed' &&
      effect.kind === 'moves' &&
      line.id !== report.id &&
      !ignored.has(line.id) &&
      line.targetOn === report.targetOn,
  )?.line
}

/**
 * Q52 : des deux reports arrivés le même jour, celui écrit en dernier, le seul qui se supprime :
 * celui que l'autre a suivi (Q50, arrivée d'avant sur son jour de départ), sinon le plus récent.
 */
export function lastOfPair(a: Line, b: Line): Line {
  if (b.previousTargetOn === a.dueOn) return a
  if (a.previousTargetOn === b.dueOn) return b
  return isMoreRecent(a, b) ? a : b
}

// R7 : un report est une ligne, il ne se coupe pas ; il n'apporte aucune heure avant l'heure touchée.
function bringsNothingEarlier(view: TreatmentView, report: Line, time: string | null): boolean {
  const effect = view.history.find(({ line }) => line.id === report.id)?.effect
  if (time === null || effect?.kind !== 'moves') return true
  return effect.keys.every((key) => key.length <= 10 || key.slice(11) >= time)
}

/**
 * R7, Q50, Q51 : l'heure touchée sur l'arrivée d'un report sans décalage, que la grille met aussi ce
 * jour-là (hors date choisie et nouveau rythme, #780) : la journée part et ce report la suit, sauf
 * s'il partage son arrivée ou apporte une heure plus tôt ; `null` : le report est redéplacé.
 */
export function arrivalOnGridDay(
  input: TreatmentViewInput,
  view: TreatmentView,
  report: Line,
  due: Due,
): { follower: Line } | { refusal: Refusal } | null {
  if (report.targetOn !== due.dueOn || report.dueOn === due.dueOn) return null
  if (shiftOfDay(input.lines, report.dueOn)?.targetOn === report.targetOn) return null
  if (opensRhythm(view, report)) return null
  const chosen = input.settings.some(
    ({ firstDueChosen, firstDueOn }) => firstDueChosen && firstDueOn === due.dueOn,
  )
  if (chosen) return null
  const arriving = view.history
    .filter(({ line, effect }) => effect.kind === 'moves' && line.targetOn === due.dueOn)
    .map(({ line }) => line.id)
  const gridDay = buildView(without(input, arriving))
    .slots(due.dueOn, due.dueOn)
    .some((slot) => slot.state === 'pending' && slot.due.dueTime === due.dueTime)
  if (!gridDay) return null
  const shared = sharedArrival(view, report)
  if (shared === undefined && bringsNothingEarlier(view, report, due.dueTime)) {
    return { follower: report }
  }
  const named = shared === undefined ? report : lastOfPair(report, shared)
  return { refusal: { reason: 'arrival-shared', on: named.dueOn } }
}

// G13, R6 : réécrit vers l'échéance qu'il remplace, le report laisserait une prise sans échéance.
export function rewriteStrands(
  input: TreatmentViewInput,
  view: TreatmentView,
  existing: Line,
  moved: Due,
): boolean {
  if (keyOf(moved.dueOn, moved.dueTime) === keyOf(existing.dueOn, existing.dueTime)) return false
  const line: LineFields = {
    ...moved,
    status: 'postponed',
    givenOn: null,
    targetOn: existing.targetOn,
  }
  return strandsNote(
    view,
    buildView(applied(input, [{ action: 'rewrite', id: existing.id, line }])),
  )
}

/** R7, #1274 : le report qui suit la journée partie arrive au même jour, ou rentre chez lui. */
export function followerLines(follower: Line | undefined, to: Day): LineChange[] {
  if (follower === undefined) return []
  if (to === follower.dueOn) return [{ action: 'delete', id: follower.id }]
  const { settingId, dueOn, dueTime } = follower
  const line: LineFields = {
    settingId,
    dueOn,
    dueTime,
    status: 'postponed',
    givenOn: null,
    targetOn: to,
  }
  return [{ action: 'rewrite', id: follower.id, line }]
}

/**
 * #1000, G13 : le report tourné depuis une date choisie, plus récent que le « Modifier » qui l'a choisie
 * (Q26, Q40), redéplacé avec la case, garde cette date comme arrivée d'avant ; sans quoi son décalage
 * ne suivrait plus le réglage.
 */
export function chosenArrivalKept(
  settings: readonly Setting[],
  report: Line,
  dayShift: Line | undefined,
  to: Day,
): Pick<LineFields, 'previousTargetOn' | 'previousTargetTime'> | undefined {
  const day = report.previousTargetOn
  if (day === undefined || day === null || day === to) return undefined
  if (dayShift?.targetOn !== report.targetOn) return undefined
  const chosen = settings.some(
    (setting) =>
      setting.firstDueChosen &&
      setting.firstDueOn === day &&
      report.decidedAt > chosenAtOf(setting),
  )
  return chosen
    ? { previousTargetOn: day, previousTargetTime: report.previousTargetTime ?? null }
    : undefined
}

// G13, Q50 : un jour d'origine laissé avant une date choisie ne rendrait rien à la suppression du
// report ; la dose y arrive depuis l'échéance qu'elle remplace désormais.
export function homeBeforeChosen(
  input: TreatmentViewInput,
  { existing, moved, dayShift }: { existing?: Line; moved: Due; dayShift?: Line },
  due: Due,
): Due | Refusal | undefined {
  if (existing === undefined || due.dueOn !== existing.targetOn) return undefined
  const ids = dayShift === undefined ? [existing.id] : [existing.id, dayShift.id]
  const rest = buildView(without(input, ids))
  if (rest.slots(moved.dueOn, moved.dueOn).length > 0) return undefined
  const setting = rest.settingAt(moved.dueOn)
  if (setting?.firstDueChosen !== true || setting.firstDueOn <= moved.dueOn) return undefined
  const view = buildView(input)
  const onChosen = due.dueOn === setting.firstDueOn
  // La date choisie qui garde sa dose ne l'a pas cédée au report.
  const kept = view
    .slots(setting.firstDueOn, setting.firstDueOn)
    .some(({ due: other }) => other.dueTime === due.dueTime)
  if (!onChosen && kept) return undefined
  // Q51, Q59 : hors de la date choisie, le report ne se coupe pas d'une heure plus tôt de son arrivée.
  const earlier = view
    .slots(due.dueOn, due.dueOn)
    .some(({ due: other }) => (other.dueTime ?? '') < (due.dueTime ?? ''))
  if (!onChosen && earlier) return { reason: 'arrival-shared', on: existing.dueOn }
  return rest
    .slots(setting.firstDueOn, setting.firstDueOn)
    .find(({ due: other, state }) => state === 'pending' && other.dueTime === due.dueTime)?.due
}
