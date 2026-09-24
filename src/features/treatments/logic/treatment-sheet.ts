import { nextDueAfterDose } from './treatment-dose'
import type { Treatment } from '../schema/treatment.schema'
import { formatDayMonthOrYear, formatLongDate, formatWeekdayDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type SheetTreatment = Pick<
  Treatment,
  'name' | 'type' | 'frequency' | 'lastDoseDate' | 'nextDueDate'
>

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
    stopLabel: t('treatments.sheet.stopLabel', named),
    otherDaySubtitle: t('treatments.sheet.otherDay.subtitle', named),
    stopDialog: {
      title: t('treatments.sheet.stopDialog.title', named),
      cancelLabel: t('treatments.sheet.stopDialog.cancelLabel', named),
      confirmLabel: t('treatments.sheet.stopDialog.confirmLabel', named),
    },
  }
}

/** Récapitulatif de F3 : la prise choisie et la prochaine dose qu'elle fixera. */
export function otherDaySummary(
  t: Translate,
  treatment: SheetTreatment,
  givenOn: string,
  today: string,
) {
  return {
    doseOn: t('treatments.sheet.otherDay.doseOn', { date: formatWeekdayDate(givenOn) }),
    nextDose: t('treatments.sheet.otherDay.nextDose', {
      date: formatLongDate(nextDueAfterDose(treatment, givenOn)),
    }),
    submit:
      givenOn === today
        ? t('treatments.sheet.otherDay.submitToday')
        : t('treatments.sheet.otherDay.submit', { date: formatDayMonthOrYear(givenOn, today) }),
  }
}

export function doseToast(
  t: Translate,
  {
    name,
    animal,
    givenOn,
    today,
  }: { name: string; animal: string; givenOn: string; today: string },
): string {
  return givenOn === today
    ? t('treatments.sheet.toast.dose', { name, animal })
    : t('treatments.sheet.toast.doseOn', {
        name,
        animal,
        date: formatDayMonthOrYear(givenOn, today),
      })
}
