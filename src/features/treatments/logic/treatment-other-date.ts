import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type HourChoice = {
  time: string
  label: string
  detail: string
  /** Échéance que noterait ce choix ; `null` : déjà donnée, rien à noter. */
  due: Due | null
}

type OtherDateSchedule = Pick<TreatmentSchedule, 'doses' | 'dueForDate'>

export function hourChoices(
  t: Translate,
  schedule: OtherDateSchedule,
  period: Pick<TreatmentPeriodRecord, 'times'>,
  givenOn: string,
): HourChoice[] {
  return [...period.times].sort().map((time) => {
    const noted = schedule.doses.find(
      (dose) => dose.dueOn === givenOn && dose.dueTime === time && dose.status !== 'postponed',
    )
    const label = formatClockTime(time)
    if (noted?.status === 'given') {
      return {
        time,
        label,
        detail: t('treatments.detail.otherDate.hour.given', { time: label }),
        due: null,
      }
    }
    return {
      time,
      label,
      detail:
        noted === undefined
          ? t('treatments.detail.otherDate.hour.pending', { time: label })
          : t('treatments.detail.otherDate.hour.missed', { time: label }),
      due: schedule.dueForDate(givenOn, time),
    }
  })
}

/** Échéance que note une prise donnée ce jour-là, pour un traitement à une heure ou sans heure. */
export function otherDateDue(
  schedule: Pick<TreatmentSchedule, 'dueForDate'>,
  givenOn: string | null,
): Due | null {
  return givenOn === null ? null : schedule.dueForDate(givenOn)
}

/** Jours dont l'échéance est déjà donnée, pour un traitement à une heure ou sans heure. */
export function givenDueDays(schedule: Pick<TreatmentSchedule, 'doses'>): string[] {
  return schedule.doses.filter(({ status }) => status === 'given').map(({ dueOn }) => dueOn)
}

export function otherDateTexts(
  t: Translate,
  { name, animal, today }: { name: string; animal: string; today: string },
  givenOn: string,
  severalTimes: boolean,
) {
  const date = formatDayMonthOrYear(givenOn, today)
  return {
    daySubtitle: t('treatments.sheet.otherDay.subtitle', { name, animal }),
    submit: severalTimes
      ? t('treatments.detail.otherDate.next')
      : givenOn === today
        ? t('treatments.sheet.otherDay.submitToday')
        : t('treatments.sheet.otherDay.submit', { date }),
    hourTitle: t('treatments.detail.otherDate.hourTitle'),
    hourSubtitle: t('treatments.detail.otherDate.hourSubtitle', { name, animal, date }),
  }
}
