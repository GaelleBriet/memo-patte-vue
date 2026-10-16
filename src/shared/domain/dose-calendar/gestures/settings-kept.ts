import { isOnGrid, later, plusDays } from '../grid'
import type { Day, Setting, SettingsPlan, TreatmentViewInput } from '../types'
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
  const drafted = settingsApplied(input, draft(dates))
  const view = buildView(drafted)
  const slots = view.slots(today, plusDays(today, NEXT_DAYS))
  // R3, R6 : à fréquence gardée, la grille ne repart pas d'un jour d'arrivée qui n'est pas une de ses
  // journées : il garde ses doses reportées, le calendrier ne bouge pas (#868).
  const arrivalOnly = (day: Day) =>
    view.history.some(({ effect }) => effect.kind === 'moves' && effect.arrival === day) &&
    buildView({
      ...drafted,
      lines: drafted.lines.filter(
        ({ status, targetOn }) => status !== 'postponed' || targetOn !== day,
      ),
    }).slots(day, day).length === 0
  // R4 : une journée qui garde les heures d'un autre réglage reste au calendrier, ses prises comptent.
  const first = slots.find(
    ({ state, due }) =>
      (state === 'pending' || due.settingId !== current.id) && !arrivalOnly(due.dueOn),
  )
  // R9 : sans journée de la grille avant la fin, la première dose encore à donner.
  const next = (first ?? slots.find(({ state }) => state === 'pending') ?? slots[0])?.due.dueOn
  const from = (start: Day): Dates =>
    gridOriginOn !== null && isOnGrid(gridOriginOn, request.frequency, start)
      ? { firstDueOn: start, gridOriginOn, firstDueChosen }
      : { firstDueOn: start, gridOriginOn: start, firstDueChosen: false }
  const proposed = from(next ?? later(firstDueOn, today))
  const arrival = strandedArrival(input, current, draft(proposed))
  return arrival === undefined ? proposed : from(arrival)
}
