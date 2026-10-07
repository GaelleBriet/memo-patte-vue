import type {
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccinationInjection,
} from './carnet-data'

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
    const history = histories.get(parentOf(event))
    if (history) history.push(event)
    else histories.set(parentOf(event), [event])
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

export type GivenDose = ExportTreatmentDose & { givenOn: string }

/** Prises données de chaque traitement, la plus récente d'abord, par leur date réelle. */
export function givenDoseHistories(
  doses: readonly ExportTreatmentDose[],
): Map<string, GivenDose[]> {
  return historiesBy(
    doses.filter((dose): dose is GivenDose => dose.givenOn !== null),
    ({ treatmentId }) => treatmentId,
    ({ givenOn }) => givenOn,
  )
}

export function vaccinationHeads(
  injections: readonly ExportVaccinationInjection[],
): Map<string, ExportVaccinationInjection> {
  return headsOf(vaccinationHistories(injections))
}

/** Période en cours de chaque traitement, dans l'ordre de `currentPeriodIdSql`. */
export function currentPeriods(
  periods: readonly ExportTreatmentPeriod[],
): Map<string, ExportTreatmentPeriod> {
  return headsOf(
    historiesBy(
      periods,
      ({ treatmentId }) => treatmentId,
      ({ startsOn }) => startsOn,
    ),
  )
}
