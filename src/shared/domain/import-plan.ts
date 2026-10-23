import type { ExportAnimal, ExportDevice } from './carnet-data'
import { byId, eventTables, type EventTable } from './import-plan-events'
import { findMisplacedDose, findMisplacedEvent, findReattached } from './import-plan-refusals'
import type {
  CascadeDeletions,
  ImportPlanInput,
  ImportPlanResult,
  ImportedAnimal,
  LocalAnimal,
  LocalDevice,
  LocalEntry,
  LocalEvent,
  PlannedWrite,
  Versioned,
} from './import-plan-types'

export type {
  ImportFile,
  ImportMode,
  ImportPlan,
  ImportPlanInput,
  ImportRefusalReason,
  LocalAnimal,
  LocalCarnet,
  LocalDose,
  LocalEntry,
  LocalInjection,
  LocalPeriod,
  PlannedWrite,
} from './import-plan-types'

/**
 * Un animal et son carnet supprimés ensemble portent exactement le même `deletedAt`
 * (`animal-deletion.service.ts`) : c'est cette égalité qui distingue une entrée emportée par la
 * cascade d'une entrée supprimée à part, qui doit rester supprimée.
 */
export function deletedWithItsAnimal(entry: LocalEntry, cascades: CascadeDeletions): boolean {
  return entry.deletedAt !== null && entry.deletedAt === cascades.get(entry.animalId)
}

/** Même règle un étage plus bas : un vaccin ou un traitement et ses lignes supprimés ensemble. */
export function deletedWithItsParent(event: LocalEvent, parentCascades: CascadeDeletions): boolean {
  return event.deletedAt !== null && event.deletedAt === parentCascades.get(event.parentId)
}

function planDevices(devices: ExportDevice[], local: LocalDevice[]): PlannedWrite<ExportDevice>[] {
  const known = byId(local)
  return devices.flatMap((device) => {
    const existing = known.get(device.id)
    return existing === undefined || Date.parse(device.updatedAt) > Date.parse(existing.updatedAt)
      ? [{ row: device, exists: existing !== undefined }]
      : []
  })
}

/**
 * Traduit les entrées d'un fichier et l'état local en écritures à jouer, sans toucher à la base.
 *
 * `merge` : la version au `updatedAt` le plus récent gagne, à égalité l'appareil garde la sienne.
 * `replace` : tout le fichier est écrit, après effacement logique des données locales. Un vaccin,
 * un traitement, une pesée ne changent jamais d'animal, une injection, une période ou une prise
 * jamais de parent : un fichier qui en déplace un est refusé en entier, comme celui dont une ligne
 * n'a de parent ni dans le fichier ni sur l'appareil. Chaque ligne se retrouve par son identifiant
 * et voyage entière : aucune échéance n'est recalculée. En fusion, un parent rendu visible revient
 * avec les lignes supprimées en même temps que lui.
 */
export function buildImportPlan({
  file: { data },
  mode,
  local,
  photosOnDevice,
  importedAt,
  deviceId,
}: ImportPlanInput): ImportPlanResult {
  const events = eventTables(data, local)
  const refused =
    findReattached(data, local) ??
    findMisplacedEvent(events.injections) ??
    findMisplacedEvent(events.periods) ??
    findMisplacedEvent(events.doses) ??
    findMisplacedDose(data, local)
  if (refused !== undefined) return { ok: false, refused }

  const replaceLocalData = mode === 'replace'
  const wins = (incoming: { updatedAt: string }, existing: { updatedAt: string } | null): boolean =>
    replaceLocalData ||
    existing === null ||
    Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)
  const dated = <T extends { updatedAt: string; updatedByDevice: string }>(
    row: T,
    existing: unknown,
  ): T =>
    existing === undefined || existing === null
      ? row
      : { ...row, updatedAt: importedAt, updatedByDevice: deviceId }

  const localAnimals = byId(local.animals)
  const photoOwners = new Map(
    local.animals.flatMap(({ id, photoPath }) =>
      photoPath === null ? [] : [[photoPath, id] as const],
    ),
  )

  /** Les photos ne voyagent pas dans l'export : l'import n'en retire jamais une déjà sur l'appareil. */
  function resolvePhoto(animal: ExportAnimal, existing: LocalAnimal | undefined): string | null {
    const name = animal.photoFileName
    const owner = name === null ? undefined : photoOwners.get(name)
    if (name !== null && (owner ?? animal.id) === animal.id && photosOnDevice.has(name)) {
      photoOwners.set(name, animal.id)
      return name
    }
    return existing?.photoPath ?? null
  }

  const animals: PlannedWrite<ImportedAnimal>[] = []
  const visibleAnimalIds = new Set<string>()
  const cascades = new Map<string, string>()

  for (const animal of data.animals) {
    const existing = localAnimals.get(animal.id)
    if (wins(animal, existing ?? null)) {
      const { photoFileName: _, ...fields } = animal
      const photoPath = resolvePhoto(animal, existing)
      animals.push({
        row: dated({ ...fields, photoPath }, existing),
        exists: existing !== undefined,
      })
      visibleAnimalIds.add(animal.id)
      if (existing !== undefined && existing.deletedAt !== null) {
        cascades.set(animal.id, existing.deletedAt)
      }
    } else if (existing?.deletedAt === null) {
      visibleAnimalIds.add(animal.id)
    }
  }

  function planEntries<T extends Versioned & { animalId: string; updatedByDevice: string }>(
    rows: T[],
    versions: LocalEntry[],
  ): PlannedWrite<T>[] {
    const known = byId(versions)
    const planned: PlannedWrite<T>[] = []
    for (const row of rows) {
      if (!visibleAnimalIds.has(row.animalId)) continue
      const existing = known.get(row.id)
      const backWithItsAnimal = existing !== undefined && deletedWithItsAnimal(existing, cascades)
      if (wins(row, existing ?? null) || backWithItsAnimal) {
        planned.push({ row: dated(row, existing), exists: existing !== undefined })
      }
    }
    return planned
  }

  /** `keeps` : condition de plus pour écrire ou ramener une ligne, par son identifiant. */
  function planEvents<E extends Versioned & { updatedByDevice: string }>(
    table: EventTable<E>,
    parents: PlannedWrite<{ id: string }>[],
    keeps: (id: string) => boolean = () => true,
  ): { writes: PlannedWrite<E>[]; revived: string[] } {
    const plannedIds = new Set(parents.map(({ row }) => row.id))
    const parentCascades = new Map(
      table.localParents.flatMap(({ id, deletedAt }) =>
        deletedAt !== null && plannedIds.has(id) ? [[id, deletedAt] as const] : [],
      ),
    )
    const visibleParentIds = new Set([
      ...plannedIds,
      ...(replaceLocalData
        ? []
        : table.localParents.filter(({ deletedAt }) => deletedAt === null).map(({ id }) => id)),
    ])
    const withItsParent = (event: LocalEvent) => deletedWithItsParent(event, parentCascades)
    const known = byId(table.localEvents)
    const writes: PlannedWrite<E>[] = []
    const written = new Set<string>()

    for (const event of table.events) {
      if (!visibleParentIds.has(table.parentOf(event)) || !keeps(event.id)) continue
      const existing = known.get(event.id)
      if (wins(event, existing ?? null) || (existing !== undefined && withItsParent(existing))) {
        writes.push({ row: dated(event, existing), exists: existing !== undefined })
        written.add(event.id)
      }
    }

    const revived = replaceLocalData
      ? []
      : table.localEvents
          .filter((event) => withItsParent(event) && !written.has(event.id) && keeps(event.id))
          .map(({ id }) => id)
    return { writes, revived }
  }

  const vaccinations = planEntries(data.vaccinations, local.vaccinations)
  const treatments = planEntries(data.treatments, local.treatments)
  const injections = planEvents(events.injections, vaccinations)
  const periods = planEvents(events.periods, treatments)

  const visiblePeriodIds = new Set([
    ...periods.writes.map(({ row }) => row.id),
    ...periods.revived,
    ...(replaceLocalData
      ? []
      : local.treatmentPeriods.filter(({ deletedAt }) => deletedAt === null).map(({ id }) => id)),
  ])
  const periodOfDose = new Map(
    [...data.treatmentDoses, ...local.treatmentDoses].map(({ id, periodId }) => [id, periodId]),
  )
  const doses = planEvents(events.doses, treatments, (id) =>
    visiblePeriodIds.has(periodOfDose.get(id) ?? ''),
  )

  const settings = data.carnetSettings
  const carnetSettings =
    settings !== null && wins(settings, local.carnetSettings)
      ? dated(settings, local.carnetSettings)
      : null

  return {
    ok: true,
    plan: {
      replaceLocalData,
      carnetSettings,
      animals,
      vaccinations,
      vaccinationInjections: injections.writes,
      revivedInjections: injections.revived,
      treatments,
      treatmentPeriods: periods.writes,
      revivedPeriods: periods.revived,
      treatmentDoses: doses.writes,
      revivedDoses: doses.revived,
      weightEntries: planEntries(data.weightEntries, local.weightEntries),
      devices: planDevices(data.devices, local.devices),
    },
  }
}
