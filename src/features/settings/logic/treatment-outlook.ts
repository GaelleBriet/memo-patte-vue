import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import { endedOnOf } from '@/shared/domain/treatment-end'
import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'
import type { TreatmentSchedule } from '@/shared/domain/treatment-schedule'

/** `dueTime` : seulement quand la période a plusieurs heures. */
export type TreatmentOutlook =
  | { kind: 'due'; dueOn: string; dueTime: string | null; overdue: boolean }
  | { kind: 'stopped'; on: string | null }
  | { kind: 'ended'; on: string | null }
  | { kind: 'unreadable' }

/** `schedule` : `null` quand le moteur juge le traitement illisible. */
export type TreatmentState = {
  periods: ExportTreatmentPeriod[]
  doses: ExportTreatmentDose[]
  schedule: TreatmentSchedule | null
  outlook: TreatmentOutlook
}

type History = Pick<TreatmentState, 'periods' | 'doses'>

function outlookOf(
  history: History,
  schedule: TreatmentSchedule | null,
  today: string,
): TreatmentOutlook {
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

export function treatmentStates(
  data: Pick<ExportData, 'treatmentPeriods' | 'treatmentDoses'>,
  today: string,
): (treatmentId: string) => TreatmentState {
  const states = new Map<string, TreatmentState>()
  return (treatmentId) => {
    const known = states.get(treatmentId)
    if (known) return known
    const history = {
      periods: data.treatmentPeriods.filter((period) => period.treatmentId === treatmentId),
      doses: data.treatmentDoses.filter((dose) => dose.treatmentId === treatmentId),
    }
    const schedule = readableTreatmentSchedule({ ...history, today })
    const state = { ...history, schedule, outlook: outlookOf(history, schedule, today) }
    states.set(treatmentId, state)
    return state
  }
}

export function treatmentOutlooks(
  data: Pick<ExportData, 'treatmentPeriods' | 'treatmentDoses'>,
  today: string,
): (treatmentId: string) => TreatmentOutlook {
  const states = treatmentStates(data, today)
  return (treatmentId) => states(treatmentId).outlook
}

export function outlookDueDate(outlook: TreatmentOutlook): string | null {
  return outlook.kind === 'due' ? outlook.dueOn : null
}
