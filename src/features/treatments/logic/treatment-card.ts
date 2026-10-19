import { currentPeriodOf } from './treatment-reading-adapter'
import { isResumablePhase } from './treatment-resumption'
import { periodRhythmText } from './treatment-rhythm'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { ExactRemindersStatus } from '@/core/notifications'
import { currentDoseText } from '@/shared/domain/current-dose'
import { dosageText } from '@/shared/domain/dosage'
import type { Due, TreatmentView } from '@/shared/domain/dose-calendar'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type DoseCardEntry = {
  due: Due
  /** `null` pour une dose en retard. */
  label: string | null
  value: string | null
  overdue: boolean
  doneLabel: string
}

export type DoseCard = {
  rhythm: string | null
  dosage: string | null
  /** Doses du moment, chacune avec son « C'est fait » ; vide quand le traitement est fini ou arrêté. */
  entries: DoseCardEntry[]
  end: { label: string | null; value: string | null } | null
}

type CardView = Pick<
  TreatmentView,
  'phase' | 'currentDoses' | 'currentSetting' | 'endedOn' | 'stoppedBeforeFirstDose'
>

export function doseCard(
  t: Translate,
  treatment: Pick<TreatmentWithPeriods, 'name' | 'periods'>,
  view: CardView,
  { animal, today }: { animal: string; today: string },
): DoseCard {
  const period = currentPeriodOf(treatment, view)
  const { phase } = view
  const named = { name: treatment.name, animal }
  const entries = view.currentDoses.map((due): DoseCardEntry => {
    const date = formatDayMonthOrYear(due.dueOn, today)
    return {
      due,
      ...currentDoseText(t, { phase, due, today }),
      overdue: phase === 'overdue',
      doneLabel:
        due.dueTime === null
          ? t('treatments.detail.doneLabel', named)
          : t('treatments.detail.doneLabelAt', {
              ...named,
              date,
              time: formatClockTime(due.dueTime),
            }),
    }
  })
  return {
    rhythm: period === null ? null : periodRhythmText(t, period, today),
    dosage: period === null ? null : dosageText(t, period),
    entries,
    end:
      entries.length > 0
        ? null
        : currentDoseText(t, {
            phase,
            due: null,
            today,
            stoppedOn: period?.stoppedOn ?? null,
            stoppedBeforeFirstDose: view.stoppedBeforeFirstDose,
            endsOn: phase === 'ended' ? view.endedOn : null,
          }),
  }
}

/** « Rappel 30 min avant · peut arriver en retard » sous les heures, rappels précis retirés (TR-34). */
export function lessPreciseReminder(
  t: Translate,
  treatment: Pick<TreatmentWithPeriods, 'periods'>,
  view: CardView,
  exact: ExactRemindersStatus | null,
): string | null {
  if (exact !== 'removed' || view.currentDoses.length === 0) return null
  const period = currentPeriodOf(treatment, view)
  if (period === null || period.times.length === 0) return null
  return t(`treatments.detail.reminder.lessPrecise.${period.reminderOffsetMinutes ?? 0}`)
}

export function detailActions({ phase }: Pick<TreatmentView, 'phase'>) {
  return {
    canEdit: phase !== 'stopped',
    canStop: phase !== 'stopped' && phase !== 'ended',
    canResume: isResumablePhase(phase),
  }
}
