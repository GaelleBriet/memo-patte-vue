import { momentDue } from './treatment-other-date'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatDayMonthOrYear, formatLongDate, formatWeekdayDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type SheetTreatment = Pick<
  Treatment,
  'name' | 'type' | 'frequency' | 'lastDoseDate' | 'nextDueDate'
>

/** Textes de « Arrêter ce traitement » et de son dialogue. */
export function treatmentStopTexts(t: Translate, named: { name: string; animal: string }) {
  return {
    stopLabel: t('treatments.sheet.stopLabel', named),
    stopDialog: {
      title: t('treatments.sheet.stopDialog.title', named),
      text: t('treatments.sheet.stopDialog.text', named),
      cancelLabel: t('treatments.sheet.stopDialog.cancelLabel', named),
      confirmLabel: t('treatments.sheet.stopDialog.confirmLabel', named),
    },
  }
}

export function treatmentSheetTexts(
  t: Translate,
  treatment: SheetTreatment,
  { animal, today }: { animal: string; today: string },
) {
  const named = { name: treatment.name, animal }
  const { value, unit } = treatment.frequency

  return {
    subtitle: t('treatments.sheet.subtitle', {
      type: t(`treatments.type.${treatment.type}`),
      animal,
      frequency: t(`treatments.sheet.frequency.${unit}`, { n: value }, value),
    }),
    due: t('treatments.sheet.nextDose', {
      date: formatDayMonthOrYear(treatment.nextDueDate, today),
    }),
    doneTodayLabel: t('treatments.sheet.doneTodayLabel', named),
    otherDaySubtitle: t('treatments.sheet.otherDay.subtitle', named),
    ...treatmentStopTexts(t, named),
  }
}

type SummarySchedule = Pick<
  TreatmentSchedule,
  'doses' | 'unloggedDoses' | 'currentDoses' | 'dueForDate' | 'doseFor'
>

/** Récapitulatif de F3 : la prise choisie et la prochaine dose qu'elle fixera ; `nextDose` : `null` sans dose à noter ce jour-là. */
export function otherDaySummary(
  t: Translate,
  schedule: SummarySchedule | null,
  givenOn: string,
  today: string,
) {
  const target = schedule === null ? null : momentDue(schedule, givenOn, today)
  const next =
    schedule !== null && target !== null && 'due' in target
      ? schedule.doseFor({ kind: 'given', due: target.due, givenOn }).nextDueDate
      : null
  return {
    doseOn: t('treatments.sheet.otherDay.doseOn', { date: formatWeekdayDate(givenOn) }),
    nextDose:
      next === null
        ? null
        : t('treatments.sheet.otherDay.nextDose', { date: formatLongDate(next) }),
    submit:
      givenOn === today
        ? t('treatments.sheet.otherDay.submitToday')
        : t('treatments.sheet.otherDay.submit', { date: formatDayMonthOrYear(givenOn, today) }),
  }
}
