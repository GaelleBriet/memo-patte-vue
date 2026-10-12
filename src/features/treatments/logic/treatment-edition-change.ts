import type {
  EditionResolution,
  NextDoseChoice,
  NextDoseDraft,
  NextDoseHelp,
} from './treatment-edition-resolution'
import { hasDoseLine, reportArrivingOn, resolveMoved } from './treatment-next-dose-move'
import { treatmentReadingOf } from './treatment-reading-adapter'
import {
  changesRhythm,
  changesSchedule,
  currentPeriod,
  lastNotedDueOn,
  rhythmOf,
  settingsOf,
  withPeriodSettings,
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

/** I4, Q29 : la première dose que calculerait le moteur à partir de la dernière prise, avant d'être ramenée à aujourd'hui. */
function calculatedOn(
  { input }: TreatmentReading,
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm,
): Day | null {
  const lastNotedOn = lastNotedDueOn(history)
  if (lastNotedOn === null) return null
  try {
    const result = newSettings({ ...input, today: lastNotedOn }, requestOf(rhythm))
    if (!('plan' in result)) return null
    const first = result.shownOn ?? result.plan.setting.firstDueOn
    return first > lastNotedOn ? first : null
  } catch {
    return null
  }
}

function helpOf(
  reading: TreatmentReading,
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  rhythm: TreatmentRhythm,
  proposedOn: Day,
  today: Day,
  hasNote: boolean,
): NextDoseHelp | null {
  const { view } = reading
  const todayHelp: NextDoseHelp | null = proposedOn === today ? { kind: 'today' } : null
  if (!hasNote) return proposedOn < today ? { kind: 'overdue', since: proposedOn } : todayHelp
  if (!changesSchedule(period, rhythm)) {
    const [due] = view.currentDoses
    if (proposedOn < today) return { kind: 'overdue', since: proposedOn }
    return due?.dueOn === proposedOn ? { kind: 'scheduled', on: proposedOn } : null
  }
  if (reportArrivingOn(view, proposedOn) !== undefined) return { kind: 'scheduled', on: proposedOn }
  const calculated = calculatedOn(reading, history, rhythm)
  if (calculated === proposedOn) return { kind: 'calculated', on: proposedOn }
  if (proposedOn > today && view.currentDoses[0]?.dueOn === proposedOn) {
    return { kind: 'scheduled', on: proposedOn }
  }
  return calculated !== null && calculated < today && proposedOn === today
    ? { kind: 'calculated-passed', on: calculated }
    : todayHelp
}

function unchanged(period: TreatmentPeriodRecord, change: Answered['change']): Answered {
  return {
    period,
    change,
    nextDose: null,
    plan: null,
    move: null,
    refusal: null,
    pastDues: [],
    pastDuesNextDose: null,
  }
}

/** La lecture sur laquelle la dose du moment se déplace : celle avec la date de fin saisie, sauf quand elle ferait sortir le report en vigueur (Q30). */
function movingReading(
  history: TreatmentWithHistory,
  period: TreatmentPeriodRecord,
  endsOn: Day | null,
  today: Day,
): TreatmentReading {
  const readWith = (day: Day | null) =>
    treatmentReadingOf(
      withPeriodSettings(history, period.id, { ...settingsOf(period), endsOn: day }),
      today,
    )
  const corrected = readWith(endsOn)
  if (endsOn === period.endsOn) return corrected
  const kept = readWith(period.endsOn)
  const keptDue = kept.view.currentDoses[0]
  const correctedDue = corrected.view.currentDoses[0]
  const holdsReport =
    keptDue !== undefined && reportArrivingOn(kept.view, keptDue.dueOn) !== undefined
  return holdsReport && correctedDue?.dueOn !== keptDue.dueOn ? kept : corrected
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
  choice: NextDoseChoice,
  today: Day,
  pastDuesChoice?: PastDuesChoice,
): Answered {
  const reading = treatmentReadingOf(history, today)
  const period = currentPeriod(history, reading.view)
  if (lockedBy(period, reading)) return unchanged(period, 'locked')
  const next = rhythm ?? rhythmOf(period)
  if (!changesRhythm(period, next) && hasDoseLine(reading.view, period.id)) {
    const moving = movingReading(history, period, next.endsOn, today)
    const due = moving.view.currentDoses[0]
    return due === undefined
      ? unchanged(period, 'edit')
      : resolveMoved({ period, history, reading: moving, due, next, choice, today })
  }
  const { chosenOn } = choice
  const typed = chosenOn !== null && isCalendarDay(chosenOn) ? chosenOn : null
  const base = newSettings(reading.input, requestOf(next))
  const proposedOn = shownOf(base) ?? reading.view.currentDoses[0]?.dueOn ?? today
  const answer = typed === null ? base : newSettings(reading.input, requestOf(next, typed))
  const hasNote = history.doses.some(({ status }) => status === 'given' || status === 'missed')
  const writes = (typed !== null && typed !== proposedOn) || changesRhythm(period, next)
  const refusal = 'refusal' in answer ? answer.refusal : null
  return {
    period,
    change: 'edit',
    nextDose: {
      change: 'first-due',
      proposedOn,
      earliest: today,
      latest: next.endsOn,
      refusal: null,
      help: helpOf(reading, history, period, next, proposedOn, today, hasNote),
      shift: null,
      shiftInitial: true,
    } satisfies NextDoseDraft,
    plan: writes ? planOf(answer, pastDuesChoice) : null,
    move: null,
    refusal,
    pastDues: 'question' in answer ? answer.question.fallen : [],
    pastDuesNextDose: datesOf(answer),
  }
}
