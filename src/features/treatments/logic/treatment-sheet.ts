import { givenWhenMin, isExtraOn } from './treatment-notification'
import { notifiedDues } from './treatment-other-date'
import { doneGesture } from './treatment-shift-box'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { NotifiedDue, TodoDue } from '@/shared/domain/reminder-route'
import type { DoseGesture, Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

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

type SheetSchedule = Pick<
  TreatmentSchedule,
  'doses' | 'unloggedDoses' | 'currentDoses' | 'offersShift' | 'noteRefusal' | 'doseFor'
>

/** La période de l'échéance de la ligne, sinon la dernière. */
export function sheetPeriod(
  history: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'doses' | 'unloggedDoses' | 'currentDoses'> | null,
  due: TodoDue | null,
): TreatmentPeriodRecord | undefined {
  const target =
    schedule === null || due === null
      ? undefined
      : due === 'unlogged'
        ? schedule.unloggedDoses[0]
        : notifiedDues(schedule, due)[0]?.due
  return (
    history.periods.find(({ id }) => id === target?.periodId) ?? history.periods.at(-1) ?? undefined
  )
}

export type SheetDoneTarget =
  | { kind: 'note'; gesture: DoseGesture }
  | { kind: 'confirm'; due: Due }
  | { kind: 'already'; givenOn: string }
  | { kind: 'missed' }
  | { kind: 'detail'; dueOn: string }
  | { kind: 'none' }

function givenOnDay(schedule: Pick<TreatmentSchedule, 'doses'>, day: string): boolean {
  return schedule.doses.some(
    ({ status, givenOn }) => (status === 'given' || status === 'extra') && givenOn === day,
  )
}

/**
 * « Fait aujourd'hui » de la feuille, sur l'échéance de sa ligne (TR-13) : `confirm` quand la prise
 * décalerait la suite (G20). Une dose à venir après une prise du jour, ou déjà donnée, est « déjà
 * notée » (Q33) ; une échéance notée oubliée n'a rien à noter (Q41). Une prise en plus ne se note que
 * sur la fiche (G11) : `detail`.
 */
export function sheetDoneTarget(
  schedule: SheetSchedule,
  due: NotifiedDue,
  today: string,
): SheetDoneTarget {
  const dues = notifiedDues(schedule, due)
  const pending = dues.find(({ status }) => status === 'pending')
  if (pending === undefined) {
    const given = dues.find(({ status }) => status === 'given')
    if (given !== undefined) return { kind: 'already', givenOn: given.givenOn ?? due.dueOn }
    return dues.some(({ status }) => status === 'missed') ? { kind: 'missed' } : { kind: 'none' }
  }
  if (pending.due.dueOn > today && givenOnDay(schedule, today)) {
    return { kind: 'already', givenOn: today }
  }
  if (isExtraOn(schedule, pending.due, today)) {
    return { kind: 'detail', dueOn: pending.due.dueOn }
  }
  const tapped = doneGesture(schedule, pending.due, today)
  return tapped.confirm
    ? { kind: 'confirm', due: pending.due }
    : { kind: 'note', gesture: tapped.gesture }
}

/** Premier jour proposé par « Fait à une autre date » pour l'échéance de la ligne. */
export function sheetOtherDateMin(
  history: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'doses' | 'unloggedDoses' | 'currentDoses' | 'doseFor'>,
  due: NotifiedDue,
  birthDate: string | null,
): string | null {
  const target = notifiedDues(schedule, due).find(({ status }) => status === 'pending')?.due
  const period = history.periods.find(({ id }) => id === target?.periodId)
  if (target === undefined || period === undefined) return birthDate
  return givenWhenMin(schedule, period, target, birthDate)
}

function dueText(t: Translate, { dueOn, dueTime }: NotifiedDue, today: string): string {
  const day = formatDayMonthOrYear(dueOn, today)
  const date =
    dueTime === null ? day : t('currentDose.at', { date: day, time: formatClockTime(dueTime) })
  return dueOn < today
    ? t('treatments.sheet.overdueSince', { date })
    : t('treatments.sheet.nextDose', { date })
}

/** `due` : l'échéance de la ligne touchée, à venir ou en retard ; `null` pour les doses non renseignées. */
export function treatmentSheetTexts(
  t: Translate,
  treatment: Pick<Treatment, 'name' | 'type'>,
  period: Pick<TreatmentPeriodRecord, 'frequency'> | undefined,
  due: TodoDue | null,
  { animal, today }: { animal: string; today: string },
) {
  const named = { name: treatment.name, animal }
  const type = t(`treatments.type.${treatment.type}`)
  const subtitle =
    period === undefined
      ? t('treatments.detail.subtitle', { type, animal })
      : t('treatments.sheet.subtitle', {
          type,
          animal,
          frequency: t(
            `treatments.sheet.frequency.${period.frequency.unit}`,
            { n: period.frequency.value },
            period.frequency.value,
          ),
        })
  return {
    subtitle,
    due: due === null || due === 'unlogged' ? null : dueText(t, due, today),
    doneTodayLabel: t('treatments.sheet.doneTodayLabel', named),
    ...treatmentStopTexts(t, named),
  }
}
