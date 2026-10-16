import { isOnGrid, later, plusDays } from '../grid'
import type { Day, Due, Setting, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { settingsApplied } from './changes'
import { NEXT_DAYS, type Dates, type SettingsRequest } from './settings-proposal'

// R7 : un report parti d'une journée du réglage corrigé, qui sortirait du calendrier si le réglage
// partait après son arrivée, laisse ce jour-là comme première échéance.
function firstArrival(input: TreatmentViewInput, current: Setting, before: Day): Day | undefined {
  return buildView(input)
    .history.filter(
      ({ line, effect }) =>
        line.status === 'postponed' &&
        effect.kind === 'moves' &&
        line.dueOn >= current.startsOn &&
        line.dueOn < before &&
        line.targetOn !== null &&
        line.targetOn > line.dueOn &&
        line.targetOn < before,
    )
    .map(({ line }) => line.targetOn!)
    .sort()[0]
}

/**
 * TR-28, Q38 : corrigé à fréquence gardée, le réglage garde sa grille, et sa date choisie avec elle ;
 * il part de sa première journée encore due à partir d'aujourd'hui ; les échéances tombées sortent.
 */
export function keptCorrection(
  input: TreatmentViewInput,
  current: Setting,
  request: SettingsRequest,
  draft: (dates: Dates) => SettingsPlan,
): Dates {
  const { today } = input
  const { firstDueOn, gridOriginOn, firstDueChosen } = current
  const dates = { firstDueOn, gridOriginOn, firstDueChosen }
  const slots = buildView(settingsApplied(input, draft(dates))).slots(
    today,
    plusDays(today, NEXT_DAYS),
  )
  // R6 : un jour d'arrivée n'est pas une journée de la grille, la grille n'en repart pas ; R7 : sauf
  // si son report partait d'une journée du réglage corrigé, qui sortirait du calendrier avec lui.
  const arrivals = new Set(
    input.lines.flatMap(({ status, dueOn, targetOn }) =>
      status === 'postponed' && targetOn && dueOn < current.startsOn ? [targetOn] : [],
    ),
  )
  const offGrid = ({ settingId, dueOn }: Due) =>
    arrivals.has(dueOn) &&
    (gridOriginOn === null
      ? settingId !== current.id
      : !isOnGrid(gridOriginOn, request.frequency, dueOn))
  // R4 : une journée qui garde les heures d'un autre réglage reste au calendrier, ses prises comptent.
  const first = slots.find(
    ({ state, due }) => !offGrid(due) && (state === 'pending' || due.settingId !== current.id),
  )
  const next = (first ?? slots[0])?.due.dueOn
  const due = next ?? later(firstDueOn, today)
  const start = firstArrival(input, current, due) ?? due
  const kept = gridOriginOn !== null && isOnGrid(gridOriginOn, request.frequency, start)
  return kept
    ? { firstDueOn: start, gridOriginOn, firstDueChosen }
    : { firstDueOn: start, gridOriginOn: start, firstDueChosen: false }
}
