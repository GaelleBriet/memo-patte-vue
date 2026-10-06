import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import { endedOnOf } from '@/shared/domain/treatment-end'
import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'

/** `dueTime` : seulement quand la période a plusieurs heures. */
export type TreatmentOutlook =
  | { kind: 'due'; dueOn: string; dueTime: string | null; overdue: boolean }
  | { kind: 'stopped'; on: string | null }
  | { kind: 'ended'; on: string | null }
  | { kind: 'unreadable' }

type History = { periods: ExportTreatmentPeriod[]; doses: ExportTreatmentDose[] }

function outlookOf(history: History, today: string): TreatmentOutlook {
  const schedule = readableTreatmentSchedule({ ...history, today })
  if (schedule === null) return { kind: 'unreadable' }
  const current = history.periods.find(({ id }) => id === schedule.currentPeriodId)
  if (schedule.phase === 'stopped') return { kind: 'stopped', on: current?.stoppedOn ?? null }
  const due = schedule.phase === 'ended' ? null : (schedule.currentDoses[0] ?? schedule.nextDue)
  if (due === null) return { kind: 'ended', on: endedOnOf(history, schedule, today) }
  const period = history.periods.find(({ id }) => id === due.periodId)
  return {
    kind: 'due',
    dueOn: due.dueOn,
    dueTime: (period?.times.length ?? 0) > 1 ? due.dueTime : null,
    overdue: schedule.phase === 'overdue',
  }
}

export function treatmentOutlooks(
  data: Pick<ExportData, 'treatmentPeriods' | 'treatmentDoses'>,
  today: string,
): (treatmentId: string) => TreatmentOutlook {
  const outlooks = new Map<string, TreatmentOutlook>()
  return (treatmentId) => {
    const known = outlooks.get(treatmentId)
    if (known) return known
    const outlook = outlookOf(
      {
        periods: data.treatmentPeriods.filter((period) => period.treatmentId === treatmentId),
        doses: data.treatmentDoses.filter((dose) => dose.treatmentId === treatmentId),
      },
      today,
    )
    outlooks.set(treatmentId, outlook)
    return outlook
  }
}

export function outlookDueDate(outlook: TreatmentOutlook): string | null {
  return outlook.kind === 'due' ? outlook.dueOn : null
}
