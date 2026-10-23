import type { ExportData } from './carnet-data'
import { byId, type EventTable, type Parent } from './import-plan-events'
import type { ImportRefusalReason, LocalCarnet, RefusedEntry } from './import-plan-types'

const ENTRY_TABLES = [
  ['vaccination', 'vaccinations'],
  ['treatment', 'treatments'],
  ['weightEntry', 'weightEntries'],
] as const

export function findReattached(data: ExportData, local: LocalCarnet): RefusedEntry | undefined {
  for (const [entity, table] of ENTRY_TABLES) {
    const known = byId(local[table])
    for (const row of data[table]) {
      const existing = known.get(row.id)
      if (existing !== undefined && existing.animalId !== row.animalId) {
        return { reason: 'reattached', entity, id: row.id }
      }
    }
  }
  return undefined
}

export function findMisplacedEvent<E extends Parent>(
  table: EventTable<E>,
): RefusedEntry | undefined {
  const parents = new Map<string, Parent>([...byId(table.localParents), ...byId(table.fileParents)])
  const known = byId(table.localEvents)
  for (const event of table.events) {
    const parent = parents.get(table.parentOf(event))
    const refused = (reason: ImportRefusalReason) => ({
      reason,
      entity: table.entity,
      id: event.id,
    })
    if (parent === undefined) return refused('orphanEvent')
    if (parent.animalId !== event.animalId) return refused('reattached')
    const existing = known.get(event.id)
    if (existing !== undefined && existing.parentId !== parent.id) return refused('reattached')
  }
  return undefined
}

/** Une prise vise une période du même traitement, et ne change jamais de période. */
export function findMisplacedDose(data: ExportData, local: LocalCarnet): RefusedEntry | undefined {
  const periods = new Map<string, { treatmentId: string }>([
    ...byId(local.treatmentPeriods),
    ...byId(data.treatmentPeriods),
  ])
  const known = byId(local.treatmentDoses)
  for (const dose of data.treatmentDoses) {
    const period = periods.get(dose.periodId)
    const refused = (reason: ImportRefusalReason): RefusedEntry => ({
      reason,
      entity: 'treatmentDose',
      id: dose.id,
    })
    if (period === undefined) return refused('orphanEvent')
    if (period.treatmentId !== dose.treatmentId) return refused('reattached')
    const existing = known.get(dose.id)
    if (existing !== undefined && existing.periodId !== dose.periodId) return refused('reattached')
  }
  return undefined
}
