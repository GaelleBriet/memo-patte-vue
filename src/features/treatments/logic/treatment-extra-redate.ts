import { extraQuestionOf, type ExtraQuestion } from './treatment-card-other-date'
import { hasSeveralTimes } from './treatment-gestures'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import {
  applied,
  play,
  redateAsksExtraOrReplaces,
  treatmentView,
  type ExtraAnswer,
} from '@/shared/domain/dose-calendar'
import type { Translate } from '@/core/i18n/translate'

export type ExtraRedateQuestion = (
  date: string | null,
  answer: ExtraAnswer | null,
  shifts: boolean,
) => ExtraQuestion | null

/** R5, Q37 : « Cette prise » pour une prise en plus déplacée là où elle couvrirait une dose. */
export function extraRedateQuestion(
  t: Translate,
  treatment: Pick<TreatmentWithPeriods, 'periods'>,
  reading: TreatmentReading,
  line: Pick<TreatmentDose, 'id' | 'status'>,
): ExtraRedateQuestion | null {
  if (line.status !== 'extra') return null
  const { input } = reading
  return (date, answer, shifts) => {
    if (date === null) return null
    const due = redateAsksExtraOrReplaces(input, line.id, date)
    if (due === null) return null
    const severalTimes = hasSeveralTimes(treatment, due.settingId)
    return extraQuestionOf(t, input.today, { due, givenOn: date, severalTimes, answer }, () => {
      const result = play(input, {
        kind: 'redate',
        lineId: line.id,
        givenOn: date,
        shiftsFollowing: shifts,
        answer: 'replaces',
      })
      if ('refusal' in result) return null
      return treatmentView(applied(input, result.changes)).nextDue?.dueOn ?? null
    })
  }
}
