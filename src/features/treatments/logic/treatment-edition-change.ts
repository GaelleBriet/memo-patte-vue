import type {
  EditionResolution,
  NextDoseChoice,
  NextDoseDraft,
  NextDoseHelp,
} from './treatment-edition-resolution'
import { treatmentReadingOf } from './treatment-reading-adapter'
import {
  changesSchedule,
  currentPeriod,
  rhythmOf,
  sameSettings,
  settingsOf,
  withRhythm,
} from './treatment-settings'
import type { PastDuesChoice, TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import {
  newSettings,
  type Day,
  type SettingsPlan,
  type SettingsRequest,
  type SettingsResult,
} from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

type Answered = EditionResolution

function requestOf(rhythm: TreatmentRhythm, firstDueOn?: Day): SettingsRequest {
  const asked = {
    frequency: rhythm.frequency,
    times: sortedTimes(rhythm.times),
    endsOn: rhythm.endsOn,
  }
  return firstDueOn === undefined ? asked : { ...asked, firstDueOn }
}

/** La « Prochaine dose » que le formulaire montre : la date écrite, ou celle que la fiche montrera (R9). */
function shownOf(result: SettingsResult): Day | null {
  if ('refusal' in result) return null
  if ('plan' in result) return result.shownOn ?? result.plan.setting.firstDueOn
  return result.question.correct.setting.firstDueOn
}

function datesOf(result: SettingsResult): Record<PastDuesChoice, string> | null {
  if (!('question' in result)) return null
  const { keep, correct } = result.question
  return { keep: result.shownOn ?? keep.setting.firstDueOn, drop: correct.setting.firstDueOn }
}

function planOf(result: SettingsResult, choice: PastDuesChoice | undefined): SettingsPlan | null {
  if ('plan' in result) return result.plan
  if ('refusal' in result || choice === undefined) return null
  return choice === 'keep' ? result.question.keep : result.question.correct
}

function helpOf(
  { view }: TreatmentReading,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  proposedOn: Day,
  today: Day,
  hasNote: boolean,
): NextDoseHelp | null {
  if (!hasNote) return proposedOn === today ? { kind: 'today' } : null
  if (!changesSchedule(period, rhythm)) {
    const [due] = view.currentDoses
    if (proposedOn < today) return { kind: 'overdue', since: proposedOn }
    return due?.dueOn === proposedOn ? { kind: 'scheduled', on: proposedOn } : null
  }
  return proposedOn === today ? { kind: 'today' } : { kind: 'calculated', on: proposedOn }
}

function locked(period: TreatmentPeriodRecord): Answered {
  return {
    period,
    change: 'locked',
    nextDose: null,
    plan: null,
    refusal: null,
    pastDues: [],
    pastDuesNextDose: null,
  }
}

function lockedBy(period: TreatmentPeriodRecord, reading: TreatmentReading): boolean {
  return period.stoppedOn !== null || reading.view.phase === 'ended'
}

/**
 * R9, R10, TR-28 : ce que « Modifier » écrirait pour ces réglages et cette « Prochaine dose », lu sur
 * le moteur ; la date saisie ne compte que si elle diffère de celle proposée.
 */
export function resolve(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  { chosenOn }: NextDoseChoice,
  today: Day,
  pastDuesChoice?: PastDuesChoice,
): Answered {
  const reading = treatmentReadingOf(history, today)
  const period = currentPeriod(history, reading.view)
  if (lockedBy(period, reading)) return locked(period)
  const next = rhythm ?? rhythmOf(period)
  const typed = chosenOn !== null && isCalendarDay(chosenOn) ? chosenOn : null
  const base = newSettings(reading.input, requestOf(next))
  const proposedOn = shownOf(base) ?? reading.view.currentDoses[0]?.dueOn ?? today
  const answer = typed === null ? base : newSettings(reading.input, requestOf(next, typed))
  const hasNote = history.doses.some(({ status }) => status === 'given' || status === 'missed')
  const writes =
    (typed !== null && typed !== proposedOn) ||
    !sameSettings(withRhythm(settingsOf(period), next), settingsOf(period))
  const refusal = 'refusal' in answer ? answer.refusal : null
  return {
    period,
    change: 'edit',
    nextDose: {
      proposedOn,
      earliest: today,
      latest: next.endsOn,
      help: helpOf(reading, period, next, proposedOn, today, hasNote),
    } satisfies NextDoseDraft,
    plan: writes ? planOf(answer, pastDuesChoice) : null,
    refusal,
    pastDues: 'question' in answer ? answer.question.fallen : [],
    pastDuesNextDose: datesOf(answer),
  }
}
