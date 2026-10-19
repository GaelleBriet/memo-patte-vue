import type { DoseFields, DoseWrite, TreatmentDose } from '../schema/treatment-dose.schema'
import type { PlannedDoseWrite } from '../schema/treatment-plan.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import type { LineChange, LineFields } from '@/shared/domain/dose-calendar'

type TreatmentToWrite = Pick<TreatmentWithPeriods, 'id' | 'animalId' | 'doses'>

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

function isUnchanged(line: TreatmentDose | undefined, dose: DoseFields): boolean {
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

/**
 * Les écritures d'un geste : chaque `LineChange` du moteur devient une écriture du repository ; une
 * réécriture aux champs inchangés est sautée, sauf pour une ligne de `restamped`, que l'écriture remet
 * en tête de sa dose (TR-25).
 */
export function doseWritesOf(
  treatment: TreatmentToWrite,
  changes: readonly LineChange[],
  newId: () => string,
  restamped: ReadonlySet<string> = new Set(),
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
        return isUnchanged(existing, dose) && !restamped.has(change.id)
          ? []
          : [{ action: 'rewrite', id: change.id, dose }]
      }
      case 'delete':
        return [{ action: 'delete', id: change.id }]
    }
  })
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
