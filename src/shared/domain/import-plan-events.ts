import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccinationInjection,
} from './carnet-data'
import type { ImportEntity, LocalCarnet, LocalEntry, LocalEvent } from './import-plan-types'

export type Parent = { id: string; animalId: string }

export type EventTable<E> = {
  entity: ImportEntity
  events: E[]
  parentOf: (event: E) => string
  fileParents: Parent[]
  localParents: LocalEntry[]
  localEvents: LocalEvent[]
}

export function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

export function eventTables(data: ExportData, local: LocalCarnet) {
  const injections: EventTable<ExportVaccinationInjection> = {
    entity: 'vaccinationInjection',
    events: data.vaccinationInjections,
    parentOf: ({ vaccinationId }) => vaccinationId,
    fileParents: data.vaccinations,
    localParents: local.vaccinations,
    localEvents: local.vaccinationInjections.map(({ vaccinationId, ...event }): LocalEvent => ({
      ...event,
      parentId: vaccinationId,
    })),
  }
  const periods: EventTable<ExportTreatmentPeriod> = {
    entity: 'treatmentPeriod',
    events: data.treatmentPeriods,
    parentOf: ({ treatmentId }) => treatmentId,
    fileParents: data.treatments,
    localParents: local.treatments,
    localEvents: local.treatmentPeriods.map(({ treatmentId, ...period }): LocalEvent => ({
      ...period,
      parentId: treatmentId,
    })),
  }
  const doses: EventTable<ExportTreatmentDose> = {
    entity: 'treatmentDose',
    events: data.treatmentDoses,
    parentOf: ({ treatmentId }) => treatmentId,
    fileParents: data.treatments,
    localParents: local.treatments,
    localEvents: local.treatmentDoses.map(({ treatmentId, ...dose }): LocalEvent => ({
      ...dose,
      parentId: treatmentId,
    })),
  }
  return { injections, periods, doses }
}
