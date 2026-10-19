import type { ExportTreatmentDose, ExportVaccinationInjection } from './carnet-data'

type Event = { id: string; createdAt: string }

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function groupedByParent<T extends Event>(
  events: readonly T[],
  parentOf: (event: T) => string,
  dateOf: (event: T) => string,
): Map<string, T[]> {
  const byParent = new Map<string, T[]>()
  for (const event of events) {
    const siblings = byParent.get(parentOf(event))
    if (siblings) siblings.push(event)
    else byParent.set(parentOf(event), [event])
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (a, b) =>
        compare(dateOf(b), dateOf(a)) || compare(b.createdAt, a.createdAt) || compare(b.id, a.id),
    )
  }
  return byParent
}

function headsOf<T>(byParent: Map<string, T[]>): Map<string, T> {
  return new Map([...byParent].map(([parentId, [head]]) => [parentId, head!]))
}

/** Injections de chaque vaccin, la tête d'abord, dans l'ordre de `headInjectionIdSql`. */
export function injectionsByVaccination(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection[]> {
  return groupedByParent(
    injections,
    ({ vaccinationId }) => vaccinationId,
    ({ injectedOn }) => injectedOn,
  )
}

export type GivenDose = ExportTreatmentDose & { givenOn: string }

/** Prises données de chaque traitement, la plus récente d'abord, par leur date réelle. */
export function givenDosesByTreatment(
  doses: readonly ExportTreatmentDose[],
): Map<string, GivenDose[]> {
  return groupedByParent(
    doses.filter((dose): dose is GivenDose => dose.givenOn !== null),
    ({ treatmentId }) => treatmentId,
    ({ givenOn }) => givenOn,
  )
}

export function vaccinationHeads(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection> {
  return headsOf(injectionsByVaccination(injections))
}
