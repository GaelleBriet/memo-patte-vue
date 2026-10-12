import type { z } from 'zod'

import { resolve } from './treatment-edition-change'
import { treatmentReadingOf } from './treatment-reading-adapter'
import { lastNotedDueOn } from './treatment-settings'
import { treatmentEditionSchema } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Refusal, TreatmentView } from '@/shared/domain/dose-calendar'

type Edition = z.output<typeof treatmentEditionSchema>

export type NextDoseOnIssueReason = 'refused' | 'tooEarly' | 'noDoseBeforeEnd'
export type EndsOnIssueReason =
  | 'beforeFirstDose'
  | 'beforeLastDose'
  | 'beforePostponedDose'
  | 'beforeAdvancedDose'
  | 'beforeFarPostponedDose'
  | 'beforeFarAdvancedDose'

type DateIssue =
  | { path: 'nextDoseOn'; message: NextDoseOnIssueReason }
  | { path: 'endsOn'; message: EndsOnIssueReason }
  | { path: 'pastDues'; message: 'required' }

/** Le report en vigueur qui arrive le plus tard dans la période en cours. */
export type FarthestMove = { arrivesOn: string; advanced: boolean; isNext: boolean }

export function farthestMoveOf(
  view: Pick<TreatmentView, 'history' | 'currentDoses'>,
  periodId: string,
): FarthestMove | null {
  const moves = view.history.flatMap(({ line, effect }) =>
    line.status === 'postponed' &&
    line.settingId === periodId &&
    effect.kind === 'moves' &&
    effect.arrival !== null
      ? [{ arrival: effect.arrival, advanced: line.targetOn! < line.dueOn }]
      : [],
  )
  const farthest = moves.reduce<(typeof moves)[number] | null>(
    (latest, move) => (latest === null || move.arrival > latest.arrival ? move : latest),
    null,
  )
  return farthest === null
    ? null
    : {
        arrivesOn: farthest.arrival,
        advanced: farthest.advanced,
        isNext: view.currentDoses[0]?.dueOn === farthest.arrival,
      }
}

function refusalIssue(refusal: Refusal): NextDoseOnIssueReason {
  switch (refusal.reason) {
    case 'too-early':
      return 'tooEarly'
    case 'no-dose-before-end':
      return 'noDoseBeforeEnd'
    default:
      return 'refused'
  }
}

function endsOnIssue(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  endsOn: string,
  today: string,
  corrects: boolean,
): EndsOnIssueReason | null {
  const { view } = treatmentReadingOf(history, today)
  const farthest = farthestMoveOf(view, period.id)
  if (farthest !== null && endsOn < farthest.arrivesOn) {
    const which = farthest.isNext ? '' : 'Far'
    return `before${which}${farthest.advanced ? 'Advanced' : 'Postponed'}Dose`
  }
  const lastDoseOn = lastNotedDueOn(history, period.id)
  if (endsOn < period.firstDueOn && corrects) return 'beforeFirstDose'
  return lastDoseOn !== null && endsOn < lastDoseOn ? 'beforeLastDose' : null
}

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const { period, change, plan, refusal, pastDues } = resolve(
    history,
    data,
    { chosenOn: data.nextDoseOn },
    today,
    data.pastDues,
  )
  if (change === 'locked') return []
  if (pastDues.length > 0 && data.pastDues === undefined) {
    return [{ path: 'pastDues', message: 'required' }]
  }
  if (refusal !== null) return [{ path: 'nextDoseOn', message: refusalIssue(refusal) }]
  if (data.endsOn === null || data.endsOn === period.endsOn) return []
  const message = endsOnIssue(history, period, data.endsOn, today, plan === null)
  return message === null ? [] : [{ path: 'endsOn', message }]
}

/** Le schéma de « Modifier » avec ses bornes de dates, celles du moteur pour « Prochaine dose ». */
export function treatmentEditionSchemaFor(history: TreatmentWithHistory, today: string) {
  return treatmentEditionSchema.superRefine((data, context) => {
    for (const { path, message } of editionIssues(history, data, today)) {
      context.addIssue({ code: 'custom', path: [path], message })
    }
  })
}
