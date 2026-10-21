import { format, parseISO } from 'date-fns'

import type { ExportFileV1 } from '../schema/export-file-v1.schema'
import type { ExportFileV2 } from '../schema/export-file-v2.schema'
import type { Version3Data } from './export-file-versions'

/** Comme l'import de la 0.1.48 : une ligne v1 donne l'injection ou la prise de son parent, à son identifiant. */
export function fromVersion1(file: ExportFileV1): ExportFileV2 {
  return {
    animals: file.animals,
    vaccinations: file.vaccinations.map(({ id, animalId, name, createdAt, updatedAt }) => ({
      id,
      animalId,
      name,
      createdAt,
      updatedAt,
    })),
    vaccinationInjections: file.vaccinations.map((vaccination) => ({
      id: vaccination.id,
      vaccinationId: vaccination.id,
      animalId: vaccination.animalId,
      injectedOn: vaccination.lastInjectionDate,
      nextDueDate: vaccination.dueDate,
      createdAt: vaccination.createdAt,
      updatedAt: vaccination.updatedAt,
    })),
    treatments: file.treatments.map((treatment) => ({
      id: treatment.id,
      animalId: treatment.animalId,
      name: treatment.name,
      type: treatment.type,
      frequency: treatment.frequency,
      stoppedOn: treatment.stoppedOn,
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
    })),
    treatmentDoses: file.treatments.map((treatment) => ({
      id: treatment.id,
      treatmentId: treatment.id,
      animalId: treatment.animalId,
      givenOn: treatment.lastDoseDate,
      nextDueDate: treatment.nextDueDate,
      frequency: treatment.frequency,
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
    })),
    weightEntries: file.weightEntries,
  }
}

/** Modèle v2, M7 : le poids à l'arrivée devient une pesée du jour de création, à l'identifiant de l'animal. */
function arrivalWeighIns(animals: ExportFileV2['animals']): Version3Data['weightEntries'] {
  return animals.flatMap(({ id, initialWeightKg, createdAt }) =>
    initialWeightKg === null
      ? []
      : [
          {
            id,
            animalId: id,
            weightKg: initialWeightKg,
            measuredOn: format(parseISO(createdAt), 'yyyy-MM-dd'),
            createdAt,
            updatedAt: createdAt,
          },
        ],
  )
}

/**
 * Le carnet au format v3, sans ses prises, que le moteur rejoue ensuite : une période par traitement,
 * à son identifiant, qui commence à la première prise (ou à l'arrêt, s'il est plus tôt).
 */
export function fromVersion2(carnet: ExportFileV2): Version3Data {
  const firstGivenOn = new Map<string, string>()
  for (const { treatmentId, givenOn } of carnet.treatmentDoses) {
    const known = firstGivenOn.get(treatmentId)
    if (known === undefined || givenOn < known) firstGivenOn.set(treatmentId, givenOn)
  }
  return {
    carnetSettings: null,
    animals: carnet.animals.map((animal) => ({
      id: animal.id,
      name: animal.name,
      species: animal.species,
      breed: animal.breed,
      birthDate: animal.birthDate,
      birthDateApproximate: false,
      photoFileName: animal.photoFileName,
      unfollowedOn: null,
      departureReason: null,
      departureDate: null,
      createdAt: animal.createdAt,
      updatedAt: animal.updatedAt,
    })),
    vaccinations: carnet.vaccinations.map((vaccination) => ({
      ...vaccination,
      plannedDueDate: null,
    })),
    vaccinationInjections: carnet.vaccinationInjections,
    treatments: carnet.treatments.map(({ id, animalId, name, type, createdAt, updatedAt }) => ({
      id,
      animalId,
      name,
      type,
      createdAt,
      updatedAt,
    })),
    treatmentPeriods: carnet.treatments.map((treatment) => {
      const firstDueOn = firstGivenOn.get(treatment.id)!
      const { stoppedOn } = treatment
      return {
        id: treatment.id,
        treatmentId: treatment.id,
        animalId: treatment.animalId,
        startsOn: stoppedOn !== null && stoppedOn < firstDueOn ? stoppedOn : firstDueOn,
        firstDueOn,
        endsOn: null,
        stoppedOn,
        frequency: treatment.frequency,
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
      }
    }),
    treatmentDoses: [],
    weightEntries: [...carnet.weightEntries, ...arrivalWeighIns(carnet.animals)],
  }
}
