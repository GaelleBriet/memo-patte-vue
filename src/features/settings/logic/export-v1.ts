import type { ExportFileV1 } from '../schema/export-v1.schema'
import type { ExportData } from '@/shared/domain/carnet-data'

export type ExportDataV1 = Pick<
  ExportFileV1,
  'animals' | 'vaccinations' | 'treatments' | 'weightEntries'
>

/**
 * Une ligne v1 ne porte que la tête de son vaccin ou traitement : elle donne un seul événement, à
 * l'identifiant du parent, que l'import retrouve par sa date. Une prise recopie la fréquence du plan.
 */
export function fromExportV1({
  animals,
  vaccinations,
  treatments,
  weightEntries,
}: ExportDataV1): ExportData {
  return {
    animals,
    vaccinations: vaccinations.map(({ id, animalId, name, createdAt, updatedAt }) => ({
      id,
      animalId,
      name,
      createdAt,
      updatedAt,
    })),
    vaccinationInjections: vaccinations.map((vaccination) => ({
      id: vaccination.id,
      vaccinationId: vaccination.id,
      animalId: vaccination.animalId,
      injectedOn: vaccination.lastInjectionDate,
      nextDueDate: vaccination.dueDate,
      createdAt: vaccination.createdAt,
      updatedAt: vaccination.updatedAt,
    })),
    treatments: treatments.map(
      ({ id, animalId, name, type, frequency, stoppedOn, createdAt, updatedAt }) => ({
        id,
        animalId,
        name,
        type,
        frequency,
        stoppedOn: stoppedOn ?? null,
        createdAt,
        updatedAt,
      }),
    ),
    treatmentDoses: treatments.map((treatment) => ({
      id: treatment.id,
      treatmentId: treatment.id,
      animalId: treatment.animalId,
      givenOn: treatment.lastDoseDate,
      nextDueDate: treatment.nextDueDate,
      frequency: treatment.frequency,
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
    })),
    weightEntries,
  }
}
