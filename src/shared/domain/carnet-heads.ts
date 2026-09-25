import type { ExportTreatmentDose, ExportVaccinationInjection } from './carnet-data'

type Event = { id: string; createdAt: string }

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function headsBy<T extends Event>(
  events: readonly T[],
  parentOf: (event: T) => string,
  dateOf: (event: T) => string,
): Map<string, T> {
  const heads = new Map<string, T>()
  for (const event of events) {
    const head = heads.get(parentOf(event))
    const isMoreRecent =
      head === undefined ||
      (compare(dateOf(event), dateOf(head)) ||
        compare(event.createdAt, head.createdAt) ||
        compare(event.id, head.id)) > 0
    if (isMoreRecent) heads.set(parentOf(event), event)
  }
  return heads
}

/** Même ordre que `headInjectionIdSql` : date, puis saisie, puis identifiant. */
export function vaccinationHeads(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection> {
  return headsBy(
    injections,
    ({ vaccinationId }) => vaccinationId,
    ({ injectedOn }) => injectedOn,
  )
}

/** Même ordre que `headDoseIdSql` : date, puis saisie, puis identifiant. */
export function treatmentHeads(
  doses: readonly ExportTreatmentDose[],
): Map<string, ExportTreatmentDose> {
  return headsBy(
    doses,
    ({ treatmentId }) => treatmentId,
    ({ givenOn }) => givenOn,
  )
}
