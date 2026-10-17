import type { DoseFields, DoseWrite, NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { PlannedDoseWrite } from '../schema/treatment-plan.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { undoRanks } from './treatment-undo-order'
import type { Line, LineChange, LineFields } from '@/shared/domain/dose-calendar'

type TreatmentToWrite = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'doses'>

export function doseFieldsOf(line: LineFields): DoseFields {
  return {
    periodId: line.settingId,
    dueOn: line.dueOn,
    dueTime: line.dueTime,
    givenOn: line.givenOn,
    status: line.status,
    targetOn: line.targetOn,
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
    line.targetOn === dose.targetOn
  )
}

/** Les écritures d'un geste : chaque `LineChange` du moteur devient une écriture du repository. */
export function doseWritesOf(
  treatment: TreatmentToWrite,
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
            treatmentId: treatment.id,
            animalId: treatment.animalId,
            dose: doseFieldsOf(change.line),
          },
        ]
      case 'rewrite': {
        const dose = doseFieldsOf(change.line)
        const existing = treatment.doses.find(({ id }) => id === change.id)
        return isUnchanged(existing, dose) ? [] : [{ action: 'rewrite', id: change.id, dose }]
      }
      case 'delete':
        return [{ action: 'delete', id: change.id }]
    }
  })
}

/** R12, #842 : réécrites telles quelles, dans leur ordre, pour rester devant les lignes que « Annuler » rétablit. */
export function keptAheadWritesOf(lines: readonly Line[]): DoseWrite[] {
  const rankOf = undoRanks(lines)
  return lines.map((line) => ({
    action: 'rewrite',
    id: line.id,
    dose: doseFieldsOf(line),
    rank: rankOf(line.id),
  }))
}

/** Écritures de « Modifier » : celles d'un geste, sans le traitement ni l'animal que `applyPlan` pose. */
export function plannedDoseWritesOf(
  treatment: TreatmentToWrite,
  changes: readonly LineChange[],
  newId: () => string,
): PlannedDoseWrite[] {
  return doseWritesOf(treatment, changes, newId).flatMap((write): PlannedDoseWrite[] => {
    switch (write.action) {
      case 'create':
        return [{ action: 'create', id: write.id, dose: write.dose }]
      case 'rewrite':
      case 'delete':
        return [write]
      case 'restore':
        return []
    }
  })
}
