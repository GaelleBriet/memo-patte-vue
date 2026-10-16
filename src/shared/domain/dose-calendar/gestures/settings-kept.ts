import { isOnGrid, later, plusDays } from '../grid'
import type { Day, Due, Setting, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { settingsApplied } from './changes'
import { NEXT_DAYS, type Dates, type SettingsRequest } from './settings-proposal'

const movingReports = (input: TreatmentViewInput) =>
  new Set(
    buildView(input)
      .history.filter(({ line, effect }) => line.status === 'postponed' && effect.kind === 'moves')
      .map(({ line }) => line.id),
  )

// R7 : un report parti d'une journée du réglage corrigé, qui deviendrait sans effet si le réglage
// partait après son arrivée, laisse ce jour-là comme première échéance.
function strandedArrival(
  input: TreatmentViewInput,
  current: Setting,
  draft: SettingsPlan,
): Day | undefined {
  const before = movingReports(input)
  const after = movingReports(settingsApplied(input, draft))
  const start = draft.setting.firstDueOn
  return input.lines
    .filter(
      ({ id, dueOn, targetOn }) =>
        before.has(id) &&
        !after.has(id) &&
        dueOn >= current.startsOn &&
        targetOn !== null &&
        targetOn > dueOn &&
        targetOn < start,
    )
    .map(({ targetOn }) => targetOn!)
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
  const from = (start: Day): Dates =>
    gridOriginOn !== null && isOnGrid(gridOriginOn, request.frequency, start)
      ? { firstDueOn: start, gridOriginOn, firstDueChosen }
      : { firstDueOn: start, gridOriginOn: start, firstDueChosen: false }
  const proposed = from(next ?? later(firstDueOn, today))
  const arrival = strandedArrival(input, current, draft(proposed))
  return arrival === undefined ? proposed : from(arrival)
}
