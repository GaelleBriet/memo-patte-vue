import { gestureDue, type GestureDue } from './gesture-due'
import { isResumablePhase } from './treatment-resumption'
import { periodRhythmText } from './treatment-rhythm'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { ExactRemindersStatus } from '@/core/notifications'
import { currentDoseText } from '@/shared/domain/current-dose'
import type { Phase, TreatmentView } from '@/shared/domain/dose-calendar'
import { dosageText } from '@/shared/domain/dosage'
import { currentPeriodIn } from '@/shared/domain/treatment-reading'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type DoseCardEntry = {
  due: GestureDue
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
  treatment: Pick<TreatmentWithHistory, 'name' | 'periods'>,
  view: CardView,
  { animal, today }: { animal: string; today: string },
): DoseCard {
  const period = currentPeriodIn(treatment.periods, view)
  const { phase } = view
  const named = { name: treatment.name, animal }
  const entries = view.currentDoses.map((due): DoseCardEntry => {
    const date = formatDayMonthOrYear(due.dueOn, today)
    return {
      due: gestureDue(due),
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
            stoppedOn: view.currentSetting?.stoppedOn ?? null,
            stoppedBeforeFirstDose: view.stoppedBeforeFirstDose,
            endsOn: phase === 'ended' ? view.endedOn : null,
          }),
  }
}

/** « Rappel 30 min avant · peut arriver en retard » sous les heures, rappels précis retirés (TR-34). */
export function lessPreciseReminder(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  view: Pick<TreatmentView, 'currentDoses' | 'currentSetting'>,
  exact: ExactRemindersStatus | null,
): string | null {
  if (exact !== 'removed' || view.currentDoses.length === 0) return null
  const period = currentPeriodIn(treatment.periods, view)
  if (period === null || period.times.length === 0) return null
  return t(`treatments.detail.reminder.lessPrecise.${period.reminderOffsetMinutes ?? 0}`)
}

export function detailActions({ phase }: { phase: Phase }) {
  return {
    canEdit: phase !== 'stopped',
    canStop: phase !== 'stopped' && phase !== 'ended',
    canResume: isResumablePhase(phase),
  }
}
