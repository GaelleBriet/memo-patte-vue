import { doneGesture } from './treatment-shift-box'
import { latestOf, nextDay, previousDay } from '@/shared/domain/calendar-day'
import {
  applied,
  play,
  treatmentView,
  type Due,
  type ExtraAnswer,
} from '@/shared/domain/dose-calendar'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import { formatClockTime, formatDayMonthOrYear, formatWeekdayDayMonth } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** TR-13, Q28 : l'échéance de la carte ; à plusieurs heures encore à donner, sa journée (`dueTime` `null`). */
export function cardTarget(dues: readonly Due[]): NotifiedDue | null {
  const [first] = dues
  if (first === undefined) return null
  return { dueOn: first.dueOn, dueTime: dues.length > 1 ? null : first.dueTime }
}

function previousDueDay({ view, input }: TreatmentReading, dueOn: string): string | undefined {
  const firstDay = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]
  if (firstDay === undefined || firstDay >= dueOn) return undefined
  return view.slots(firstDay, previousDay(dueOn)).at(-1)?.due.dueOn
}

/**
 * Q28 : les jours se choisissent du lendemain de l'échéance précédente à aujourd'hui, aujourd'hui
 * toujours compris (Q29) ; `earlierHelp` : des jours sont grisés par cette échéance.
 */
export function cardOtherDateDays(
  reading: TreatmentReading,
  target: NotifiedDue,
  today: string,
  birthDate: string | null,
): { min: string | null; earlierHelp: boolean } {
  const previous = previousDueDay(reading, target.dueOn)
  if (previous === undefined) return { min: birthDate, earlierHelp: false }
  const after = nextDay(previous)
  return { min: latestOf([after > today ? today : after, birthDate])!, earlierHelp: true }
}

/** « C'est fait » de la carte : la prise serait en plus ou remplacerait la dose, la feuille le demande (Q27). */
export function cardDone(
  reading: TreatmentReading,
  due: Due,
  today: string,
): { ask: true } | ReturnType<typeof doneGesture> {
  return reading.view.asksExtraOrReplaces(due, today)
    ? { ask: true }
    : doneGesture(reading, due, today)
}

export type ExtraQuestion = {
  title: string
  options: [{ value: 'extra'; label: string }, { value: 'replaces'; label: string }]
  /** Ce qu'écrit la réponse choisie ; `null` sans réponse. */
  help: string | null
}

function nextDoseAfter(
  { input }: TreatmentReading,
  due: Due,
  givenOn: string,
  shiftsFollowing: boolean,
): Due | null {
  const result = play(input, {
    kind: 'note',
    due,
    status: 'given',
    givenOn,
    shiftsFollowing,
    answer: 'replaces',
  })
  if ('refusal' in result) return null
  return treatmentView(applied(input, result.changes)).nextDue ?? null
}

/** R5, Q27 : `null` quand la prise couvre sans question ; `shifts` : la case de « Remplace ». */
export function extraQuestion(
  t: Translate,
  reading: TreatmentReading,
  due: Due,
  givenOn: string,
  severalTimes: boolean,
  answer: ExtraAnswer | null,
  shifts: boolean,
): ExtraQuestion | null {
  if (!reading.view.asksExtraOrReplaces(due, givenOn)) return null
  const { today } = reading.input
  const day = (date: string) => formatDayMonthOrYear(date, today)
  const named = ({ dueOn, dueTime }: Due) =>
    severalTimes && dueTime !== null
      ? t('currentDose.at', { date: day(dueOn), time: formatClockTime(dueTime) })
      : day(dueOn)
  const dueText = named(due)
  const options: ExtraQuestion['options'] = [
    { value: 'extra', label: t('treatments.detail.otherDate.question.extra') },
    {
      value: 'replaces',
      label: t('treatments.detail.otherDate.question.replaces', { due: dueText }),
    },
  ]
  const title = t('treatments.detail.otherDate.question.title')
  if (answer === null) return { title, options, help: null }
  if (answer === 'extra') {
    const help = t('treatments.shift.recapExtra', {
      given: formatWeekdayDayMonth(givenOn),
      due: dueText,
    })
    return { title, options, help }
  }
  const next = nextDoseAfter(reading, due, givenOn, shifts)
  const help =
    next === null
      ? t('treatments.detail.otherDate.question.replacesHelpLast', {
          given: day(givenOn),
          due: dueText,
        })
      : t('treatments.detail.otherDate.question.replacesHelp', {
          given: day(givenOn),
          due: dueText,
          next: named(next),
        })
  return { title, options, help }
}
