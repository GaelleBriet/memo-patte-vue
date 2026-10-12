import type { DoseWrite, NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { LineChange, LineFields } from '@/shared/domain/dose-calendar'

type History = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'doses'>

type DoseFields = Extract<DoseWrite, { action: 'create' }>['dose']

/** Le schéma v11 garde `next_due_date` pour toute ligne : une prise l'écrit sans le relire (plan §3). */
export function doseFieldsOf(line: LineFields): DoseFields {
  return {
    periodId: line.settingId,
    dueOn: line.dueOn,
    dueTime: line.dueTime,
    givenOn: line.givenOn,
    status: line.status,
    nextDueDate: line.targetOn ?? line.dueOn,
  }
}

function isUnchanged(line: NewTreatmentDose | undefined, dose: DoseFields): boolean {
  return (
    line !== undefined &&
    line.periodId === dose.periodId &&
    line.dueOn === dose.dueOn &&
    line.dueTime === dose.dueTime &&
    line.givenOn === dose.givenOn &&
    line.status === dose.status &&
    line.nextDueDate === dose.nextDueDate
  )
}

/** Les écritures d'un geste : chaque `LineChange` du moteur devient une écriture du repository. */
export function doseWritesOf(
  history: History,
  changes: readonly LineChange[],
  newId: () => string,
): DoseWrite[] {
  return changes.flatMap((change): DoseWrite[] => {
    switch (change.action) {
      case 'create':
        return [
          {
            action: 'create',
            id: newId(),
            treatmentId: history.id,
            animalId: history.animalId,
            dose: doseFieldsOf(change.line),
          },
        ]
      case 'rewrite': {
        const dose = doseFieldsOf(change.line)
        const existing = history.doses.find(({ id }) => id === change.id)
        return isUnchanged(existing, dose) ? [] : [{ action: 'rewrite', id: change.id, dose }]
      }
      case 'delete':
        return [{ action: 'delete', id: change.id }]
    }
  })
}
