import type { z } from 'zod'

import { farthestMoveOf, resolve } from './treatment-edition-change'
import { lastNotedDueOn } from './treatment-settings'
import { treatmentEditionSchema } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

type Edition = z.output<typeof treatmentEditionSchema>

export type NextDoseOnIssueReason = 'refused' | 'tooEarly' | 'afterEnd' | 'afterNextDose'
export type EndsOnIssueReason =
  | 'beforeFirstDose'
  | 'beforeNextDose'
  | 'beforeLastDose'
  | 'beforePostponedDose'
  | 'beforeAdvancedDose'
  | 'beforeFarPostponedDose'
  | 'beforeFarAdvancedDose'

type DateIssue =
  | { path: 'nextDoseOn'; message: NextDoseOnIssueReason }
  | { path: 'endsOn'; message: EndsOnIssueReason }
  | { path: 'pastDues'; message: 'required' }

function editionIssues(history: TreatmentWithHistory, data: Edition, today: string): DateIssue[] {
  const shiftsFollowing = data.shiftsFollowing ?? true
  const { period, change, nextDose, proposesFirstDue, movedLineId, pastDues } = resolve(
    history,
    data,
    { chosenOn: null, shiftsFollowing },
    today,
    data.pastDues,
  )
  if (change === 'locked') return []
  if (pastDues.length > 0 && data.pastDues === undefined) {
    return [{ path: 'pastDues', message: 'required' }]
  }

  const issues: DateIssue[] = []
  const chosenOn = nextDose === null ? null : data.nextDoseOn
  const changed = nextDose !== null && chosenOn !== null && chosenOn !== nextDose.proposedOn
  if (changed) {
    if (nextDose.refusal !== null) issues.push({ path: 'nextDoseOn', message: 'refused' })
    else if (chosenOn < nextDose.earliest) issues.push({ path: 'nextDoseOn', message: 'tooEarly' })
    else if (nextDose.latest !== null && chosenOn > nextDose.latest) {
      const pastNext = !shiftsFollowing && (data.endsOn === null || chosenOn <= data.endsOn)
      issues.push({ path: 'nextDoseOn', message: pastNext ? 'afterNextDose' : 'afterEnd' })
    }
  }
  if (data.endsOn === null || issues.length > 0) return issues

  const farthest =
    change === 'correct'
      ? farthestMoveOf(history, period.id, today, changed ? movedLineId : null)
      : null
  if (farthest !== null && data.endsOn !== period.endsOn && data.endsOn < farthest.arrivesOn) {
    const which = farthest.doseId === movedLineId ? '' : 'Far'
    const reason: EndsOnIssueReason = farthest.advanced
      ? `before${which}AdvancedDose`
      : `before${which}PostponedDose`
    return [{ path: 'endsOn', message: reason }]
  }
  const setsFirstDue = nextDose?.change === 'first-due' && (proposesFirstDue || changed)
  if (setsFirstDue && data.endsOn < (chosenOn ?? nextDose.proposedOn)) {
    issues.push({ path: 'endsOn', message: 'beforeNextDose' })
  } else if (change === 'correct' && data.endsOn !== period.endsOn) {
    const lastDoseOn = lastNotedDueOn(history, period.id)
    if (data.endsOn < period.firstDueOn && !setsFirstDue) {
      issues.push({ path: 'endsOn', message: 'beforeFirstDose' })
    } else if (lastDoseOn !== null && data.endsOn < lastDoseOn) {
      issues.push({ path: 'endsOn', message: 'beforeLastDose' })
    }
  }
  return issues
}

/** Le schéma de « Modifier » avec ses bornes de dates, celles du moteur pour « Prochaine dose ». */
export function treatmentEditionSchemaFor(history: TreatmentWithHistory, today: string) {
  return treatmentEditionSchema.superRefine((data, context) => {
    for (const { path, message } of editionIssues(history, data, today)) {
      context.addIssue({ code: 'custom', path: [path], message })
    }
  })
}
