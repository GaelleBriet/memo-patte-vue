import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import type { TreatmentView } from '@/shared/domain/dose-calendar'
import { treatmentReading } from '@/shared/domain/treatment-reading'

/** `dueTime` : seulement quand la période a plusieurs heures. */
export type TreatmentOutlook =
  | { kind: 'due'; dueOn: string; dueTime: string | null; overdue: boolean }
  | { kind: 'stopped'; on: string | null; beforeFirstDose: boolean }
  | { kind: 'ended'; on: string | null }
  | { kind: 'unreadable' }

/** `view` : `null` quand le moteur juge le traitement illisible. */
export type TreatmentState = {
  periods: ExportTreatmentPeriod[]
  doses: ExportTreatmentDose[]
  view: TreatmentView | null
  outlook: TreatmentOutlook
}

function outlookOf(
  periods: readonly ExportTreatmentPeriod[],
  view: TreatmentView | null,
): TreatmentOutlook {
  if (view === null) return { kind: 'unreadable' }
  if (view.phase === 'stopped') {
    return { kind: 'stopped', on: view.endedOn, beforeFirstDose: view.stoppedBeforeFirstDose }
  }
  const due = view.phase === 'ended' ? null : (view.currentDoses[0] ?? view.nextDue)
  if (due === null) return { kind: 'ended', on: view.endedOn }
  const period = periods.find(({ id }) => id === due.settingId)
  return {
    kind: 'due',
    dueOn: due.dueOn,
    dueTime: (period?.times.length ?? 0) > 1 ? due.dueTime : null,
    overdue: view.phase === 'overdue',
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
    const treatment = {
      periods: data.treatmentPeriods.filter((period) => period.treatmentId === treatmentId),
      doses: data.treatmentDoses.filter((dose) => dose.treatmentId === treatmentId),
    }
    const view = treatmentReading(treatment, today)
    const state = { ...treatment, view, outlook: outlookOf(treatment.periods, view) }
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
