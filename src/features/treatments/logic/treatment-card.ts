import { currentPeriodOf } from './treatment-schedule'
import { periodRhythmText } from './treatment-rhythm'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import { currentDoseText } from '@/shared/domain/current-dose'
import { dosageText } from '@/shared/domain/dosage'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

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

type CardSchedule = Pick<TreatmentSchedule, 'phase' | 'currentDoses' | 'currentPeriodId'>

export function doseCard(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'name' | 'periods'>,
  schedule: CardSchedule,
  { animal, today }: { animal: string; today: string },
): DoseCard {
  const period = currentPeriodOf(treatment, schedule)
  const { phase } = schedule
  const named = { name: treatment.name, animal }
  const entries = schedule.currentDoses.map((due): DoseCardEntry => {
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
            endsOn: period?.endsOn ?? null,
          }),
  }
}

export function detailActions({ phase }: Pick<TreatmentSchedule, 'phase'>) {
  return {
    canEdit: phase !== 'stopped',
    canStop: phase !== 'stopped' && phase !== 'ended',
    canResume: phase === 'stopped' || phase === 'ended',
  }
}
