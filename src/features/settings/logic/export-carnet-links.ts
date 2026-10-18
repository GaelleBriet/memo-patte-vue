type Row = { id: string; animalId: string }
type Carnet = {
  animals: { id: string }[]
  treatments: Row[]
  treatmentPeriods: (Row & { treatmentId: string })[]
} & Record<'vaccinations' | 'vaccinationInjections' | 'treatmentDoses' | 'weightEntries', Row[]>

const hasUniqueIds = (rows: { id: string }[]) =>
  new Set(rows.map(({ id }) => id)).size === rows.length

/** Identifiants uniques ; chaque ligne rattachée à un animal, chaque traitement à une période. */
export function isConsistentCarnet(data: Carnet): boolean {
  const { animals, treatments, treatmentPeriods } = data
  const children = [
    ...treatments,
    ...treatmentPeriods,
    ...data.vaccinations,
    ...data.vaccinationInjections,
    ...data.treatmentDoses,
    ...data.weightEntries,
  ]
  const animalIds = new Set(animals.map(({ id }) => id))
  const withPeriod = new Set(treatmentPeriods.map(({ treatmentId }) => treatmentId))
  return (
    [
      animals,
      treatments,
      treatmentPeriods,
      data.vaccinations,
      data.vaccinationInjections,
      data.treatmentDoses,
      data.weightEntries,
    ].every(hasUniqueIds) &&
    children.every(({ animalId }) => animalIds.has(animalId)) &&
    treatments.every(({ id }) => withPeriod.has(id))
  )
}
