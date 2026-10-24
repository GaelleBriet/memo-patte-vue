import { cardOtherDateDays, extraQuestion, type ExtraQuestion } from './treatment-card-other-date'
import { hasSeveralTimes } from './treatment-gestures'
import { givenDays } from './treatment-other-date'
import { otherDateRecap } from './treatment-shift-box'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { Due, ExtraAnswer } from '@/shared/domain/dose-calendar'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import type { Translate } from '@/core/i18n/translate'

export type OtherDateSheetState = {
  treatment: Pick<TreatmentWithPeriods, 'periods'>
  reading: TreatmentReading
  today: string
  /** Le premier jour que donne l'écran : la naissance, ou la borne de « À faire » et de la notification. */
  min: string | null
  /** La carte de la fiche ; `null` depuis « À faire » ou une notification. */
  target: NotifiedDue | null
  due: Due | null
  givenOn: string | null
  answer: ExtraAnswer | null
  shifts: boolean
}

export type OtherDateSheetPlan = {
  min: string | null
  excluded: string[]
  earlierHelp: boolean
  /** R5 : seulement depuis la carte (Q27). */
  question: ExtraQuestion | null
  /** Seulement sans question, qui le dit déjà. */
  recap: string | null
  /** La réponse que l'enregistrement emporte : `null` attend la réponse, `undefined` sans question. */
  asked: ExtraAnswer | null | undefined
}

/** Ce que montre « Fait à une autre date » : les jours, la question « Cette prise », le récapitulatif. */
export function otherDateSheetPlan(
  t: Translate,
  { treatment, reading, today, min, target, due, givenOn, answer, shifts }: OtherDateSheetState,
): OtherDateSheetPlan {
  const severalTimes = due !== null && hasSeveralTimes(treatment, due.settingId)
  const days =
    target === null ? { min, earlierHelp: false } : cardOtherDateDays(reading, target, today, min)
  const question =
    target === null || due === null || givenOn === null
      ? null
      : extraQuestion(t, reading, due, givenOn, severalTimes, answer, shifts)
  return {
    ...days,
    excluded: target === null ? givenDays(reading.view) : [],
    question,
    recap: question === null ? otherDateRecap(t, due, givenOn, severalTimes) : null,
    asked: question === null ? undefined : answer,
  }
}
