import type {
  EditionResolution,
  NextDoseChoice,
  NextDoseDraft,
  NextDoseHelp,
  PastDuesNextDose,
} from './treatment-edition-resolution'
import { hasDoseLine, reportArrivingOn, resolveMoved } from './treatment-next-dose-move'
import { carnetReadingOf, treatmentReadingOf } from './treatment-reading-adapter'
import {
  changesRhythm,
  changesSchedule,
  currentPeriod,
  lastNotedDueOn,
  rhythmOf,
  settingsOf,
} from './treatment-settings'
import { correctionOf, settingsPlanOf } from './treatment-settings-writes'
import type { PastDuesChoice, TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import {
  chosenDateRefusal,
  newSettings,
  settingsApplied,
  type Day,
  type Refusal,
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

/** La première échéance que « Elles restent à renseigner » écrirait, celle que la fiche montrera. */
const keptOn = (result: Extract<SettingsResult, { question: unknown }>): Day =>
  result.shownOn ?? result.question.keep.setting.firstDueOn

/** La « Prochaine dose » que le formulaire montre : la date écrite, ou celle que la fiche montrera (R9). */
function shownOf(result: SettingsResult): Day | null {
  if ('refusal' in result) return null
  if ('plan' in result) return result.shownOn ?? result.plan.setting.firstDueOn
  const { correct } = result.question
  return 'refusal' in correct ? keptOn(result) : correct.setting.firstDueOn
}

function datesOf(result: SettingsResult): PastDuesNextDose | null {
  if (!('question' in result)) return null
  const { correct } = result.question
  return { keep: keptOn(result), drop: 'refusal' in correct ? null : correct.setting.firstDueOn }
}

function answerOf(result: SettingsResult, choice: PastDuesChoice | undefined) {
  if ('plan' in result) return result.plan
  if ('refusal' in result || choice === undefined) return result
  return choice === 'keep' ? result.question.keep : result.question.correct
}

const planOf = (answer: ReturnType<typeof answerOf>): SettingsPlan | null =>
  'setting' in answer ? answer : null

const refusalOf = (answer: ReturnType<typeof answerOf>): Refusal | null =>
  'refusal' in answer ? answer.refusal : null

// Q29 : la première dose calculée à partir de la dernière prise, avant d'être ramenée à aujourd'hui.
function calculatedOn(
  { input }: TreatmentReading,
  treatment: TreatmentWithPeriods,
  rhythm: TreatmentRhythm,
): Day | null {
  const lastNotedOn = lastNotedDueOn(treatment)
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
  treatment: TreatmentWithPeriods,
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
  const calculated = calculatedOn(reading, treatment, rhythm)
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
  reading: TreatmentReading,
  period: TreatmentPeriodRecord,
  endsOn: Day | null,
): TreatmentReading {
  if (endsOn === period.endsOn) return reading
  const correction = settingsPlanOf(correctionOf(period, { ...settingsOf(period), endsOn }))
  const corrected = carnetReadingOf(settingsApplied(reading.input, correction))
  const keptDue = reading.view.currentDoses[0]
  const correctedDue = corrected.view.currentDoses[0]
  const holdsReport =
    keptDue !== undefined && reportArrivingOn(reading.view, keptDue.dueOn) !== undefined
  return holdsReport && correctedDue?.dueOn !== keptDue.dueOn ? reading : corrected
}

function lockedBy(period: TreatmentPeriodRecord, reading: TreatmentReading): boolean {
  return period.stoppedOn !== null || reading.view.phase === 'ended'
}

/**
 * R9, R10, TR-28 : ce que « Modifier » écrirait pour ces réglages et cette « Prochaine dose », lu sur
 * le moteur ; la date saisie ne compte que si elle diffère de celle proposée.
 */
export function resolve(
  treatment: TreatmentWithPeriods,
  rhythm: TreatmentRhythm | null,
  choice: NextDoseChoice,
  today: Day,
  pastDuesChoice?: PastDuesChoice,
): Answered {
  const reading = treatmentReadingOf(treatment, today)
  const period = currentPeriod(treatment, reading.view)
  if (lockedBy(period, reading)) return unchanged(period, 'locked')
  const next = rhythm ?? rhythmOf(period)
  if (!changesRhythm(period, next) && hasDoseLine(reading.view, period.id)) {
    const moving = movingReading(reading, period, next.endsOn)
    const due = moving.view.currentDoses[0]
    return due === undefined
      ? unchanged(period, 'edit')
      : resolveMoved({ period, treatment, reading: moving, due, next, choice, today })
  }
  const { chosenOn } = choice
  const typed = chosenOn !== null && isCalendarDay(chosenOn) ? chosenOn : null
  const base = newSettings(reading.input, requestOf(next))
  const proposedOn = shownOf(base) ?? reading.view.currentDoses[0]?.dueOn ?? today
  const answer = typed === null ? base : newSettings(reading.input, requestOf(next, typed))
  const hasNote = treatment.doses.some(({ status }) => status === 'given' || status === 'missed')
  const writes = (typed !== null && typed !== proposedOn) || changesRhythm(period, next)
  const chosen = answerOf(answer, pastDuesChoice)
  const fieldRefusal = chosenDateRefusal(reading.input, base)
  return {
    period,
    change: 'edit',
    nextDose: {
      change: 'first-due',
      proposedOn,
      earliest: today,
      latest: next.endsOn,
      refusal: fieldRefusal,
      help:
        fieldRefusal === null
          ? helpOf(reading, treatment, period, next, proposedOn, today, hasNote)
          : { kind: 'refused', refusal: fieldRefusal },
      shift: null,
      shiftInitial: true,
    } satisfies NextDoseDraft,
    plan: writes ? planOf(chosen) : null,
    move: null,
    refusal: refusalOf(chosen),
    pastDues: 'question' in answer ? answer.question.fallen : [],
    pastDuesNextDose: datesOf(answer),
  }
}
