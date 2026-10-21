import { hasUniqueIds } from './export-carnet-links'

export const isLinkedLegacyCarnet = (
  animals: { id: string }[],
  tables: { id: string; animalId: string }[][],
) => {
  const animalIds = new Set(animals.map(({ id }) => id))
  return (
    hasUniqueIds(animals) &&
    tables.every(
      (rows) => hasUniqueIds(rows) && rows.every(({ animalId }) => animalIds.has(animalId)),
    )
  )
}

type LegacyLinks = {
  vaccinations: { id: string }[]
  vaccinationInjections: { vaccinationId: string }[]
  treatments: { id: string }[]
  treatmentDoses: { treatmentId: string }[]
}

/** Comme l'import de la 0.1.48 : chaque vaccin a une injection, chaque traitement une prise, et inversement. */
export function hasEveryParentAndChild(file: LegacyLinks): boolean {
  const vaccinations = new Set(file.vaccinations.map(({ id }) => id))
  const treatments = new Set(file.treatments.map(({ id }) => id))
  const injected = new Set(file.vaccinationInjections.map(({ vaccinationId }) => vaccinationId))
  const dosed = new Set(file.treatmentDoses.map(({ treatmentId }) => treatmentId))
  return (
    [...injected].every((id) => vaccinations.has(id)) &&
    [...dosed].every((id) => treatments.has(id)) &&
    [...vaccinations].every((id) => injected.has(id)) &&
    [...treatments].every((id) => dosed.has(id))
  )
}
