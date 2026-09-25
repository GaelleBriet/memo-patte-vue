import type { ExportTreatmentDose, ExportVaccinationInjection } from './carnet-data'

type Event = { id: string; createdAt: string }

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function historiesBy<T extends Event>(
  events: readonly T[],
  parentOf: (event: T) => string,
  dateOf: (event: T) => string,
): Map<string, T[]> {
  const histories = new Map<string, T[]>()
  for (const event of events) {
    histories.set(parentOf(event), [...(histories.get(parentOf(event)) ?? []), event])
  }
  for (const history of histories.values()) {
    history.sort(
      (a, b) =>
        compare(dateOf(b), dateOf(a)) || compare(b.createdAt, a.createdAt) || compare(b.id, a.id),
    )
  }
  return histories
}

function headsOf<T>(histories: Map<string, T[]>): Map<string, T> {
  return new Map([...histories].map(([parentId, [head]]) => [parentId, head!]))
}

/** Injections de chaque vaccin, la tête d'abord, dans l'ordre de `headInjectionIdSql`. */
export function vaccinationHistories(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection[]> {
  return historiesBy(
    injections,
    ({ vaccinationId }) => vaccinationId,
    ({ injectedOn }) => injectedOn,
  )
}

/** Prises de chaque traitement, la tête d'abord, dans l'ordre de `headDoseIdSql`. */
export function treatmentHistories(
  doses: readonly ExportTreatmentDose[],
): Map<string, ExportTreatmentDose[]> {
  return historiesBy(
    doses,
    ({ treatmentId }) => treatmentId,
    ({ givenOn }) => givenOn,
  )
}

export function vaccinationHeads(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection> {
  return headsOf(vaccinationHistories(injections))
}

export function treatmentHeads(
  doses: readonly ExportTreatmentDose[],
): Map<string, ExportTreatmentDose> {
  return headsOf(treatmentHistories(doses))
}
