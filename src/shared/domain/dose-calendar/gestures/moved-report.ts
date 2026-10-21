import type { Day, Due, Line, LineFields, Setting, TreatmentViewInput } from '../types'
import type { TreatmentView } from '../view'
import { shiftOfDay } from './changes'

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

/**
 * #1000, G13 : le report tourné depuis une date choisie, redéplacé avec la case, garde cette date
 * comme arrivée d'avant ; sans quoi son décalage ne suivrait plus le réglage qui l'a choisie.
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
    ({ firstDueChosen, firstDueOn }) => firstDueChosen && firstDueOn === day,
  )
  return chosen
    ? { previousTargetOn: day, previousTargetTime: report.previousTargetTime ?? null }
    : undefined
}
