import type {
  ExportAnimal,
  ExportData,
  ExportTreatment,
  ExportTreatmentDose,
  ExportVaccination,
  ExportVaccinationInjection,
  ExportWeightEntry,
} from './carnet-data'

export type ImportMode = 'merge' | 'replace'

/** Un fichier v1 ne porte que la tête de chaque vaccin et traitement : ses événements se retrouvent par leur date. */
export type ImportFile = { schemaVersion: 1 | 2; data: ExportData }

type Stamped = { id: string; updatedAt: string }

export type LocalAnimal = Stamped & { deletedAt: string | null; photoPath: string | null }
export type LocalEntry = Stamped & { deletedAt: string | null; animalId: string }
export type LocalInjection = Stamped & {
  deletedAt: string | null
  vaccinationId: string
  injectedOn: string
}
export type LocalDose = Stamped & { deletedAt: string | null; treatmentId: string; givenOn: string }

export type LocalCarnet = {
  animals: LocalAnimal[]
  vaccinations: LocalEntry[]
  vaccinationInjections: LocalInjection[]
  treatments: LocalEntry[]
  treatmentDoses: LocalDose[]
  weightEntries: LocalEntry[]
}

export type LocalEvent = Stamped & { deletedAt: string | null; parentId: string; date: string }

export type ImportedAnimal = Omit<ExportAnimal, 'photoFileName'> & { photoPath: string | null }

export type PlannedWrite<T> = { row: T; exists: boolean }

export type ImportPlan = {
  replaceLocalData: boolean
  animals: PlannedWrite<ImportedAnimal>[]
  vaccinations: PlannedWrite<ExportVaccination>[]
  vaccinationInjections: PlannedWrite<ExportVaccinationInjection>[]
  revivedInjections: string[]
  treatments: PlannedWrite<ExportTreatment>[]
  treatmentDoses: PlannedWrite<ExportTreatmentDose>[]
  revivedDoses: string[]
  weightEntries: PlannedWrite<ExportWeightEntry>[]
}

export type ImportEntity =
  'vaccination' | 'vaccinationInjection' | 'treatment' | 'treatmentDose' | 'weightEntry'

/**
 * `reattached` : une entrée change d'animal, un événement change de parent ou n'a pas l'animal de
 * son parent. `orphanEvent` : ni le fichier ni l'appareil n'ont le parent d'un événement.
 */
export type ImportRefusalReason = 'reattached' | 'orphanEvent'

export type RefusedEntry = { reason: ImportRefusalReason; entity: ImportEntity; id: string }

export type ImportPlanResult = { ok: true; plan: ImportPlan } | { ok: false; refused: RefusedEntry }

export type ImportPlanInput = {
  file: ImportFile
  mode: ImportMode
  local: LocalCarnet
  photosOnDevice: ReadonlySet<string>
  importedAt: string
  newId: () => string
}

/** Date de suppression d'un animal ou d'un parent que le fichier rend visible, par identifiant. */
export type CascadeDeletions = ReadonlyMap<string, string>

/**
 * Un animal et son carnet supprimés ensemble portent exactement le même `deletedAt`
 * (`animal-deletion.service.ts`) : c'est cette égalité qui distingue une entrée emportée par la
 * cascade d'une entrée supprimée à part, qui doit rester supprimée.
 */
export function deletedWithItsAnimal(entry: LocalEntry, cascades: CascadeDeletions): boolean {
  return entry.deletedAt !== null && entry.deletedAt === cascades.get(entry.animalId)
}

/** Même règle un étage plus bas : un vaccin ou un traitement et ses événements supprimés ensemble. */
export function deletedWithItsParent(event: LocalEvent, parentCascades: CascadeDeletions): boolean {
  return event.deletedAt !== null && event.deletedAt === parentCascades.get(event.parentId)
}

const ENTRY_TABLES = [
  ['vaccination', 'vaccinations'],
  ['treatment', 'treatments'],
  ['weightEntry', 'weightEntries'],
] as const

type EventTable<E> = {
  entity: ImportEntity
  events: E[]
  parentOf: (event: E) => string
  dateOf: (event: E) => string
  fileParents: { id: string; animalId: string }[]
  localParents: LocalEntry[]
  localEvents: LocalEvent[]
}

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function eventsByParent(events: readonly LocalEvent[]): Map<string, LocalEvent[]> {
  const byParent = new Map<string, LocalEvent[]>()
  for (const event of events) {
    byParent.set(event.parentId, [...(byParent.get(event.parentId) ?? []), event])
  }
  return byParent
}

function eventTables(data: ExportData, local: LocalCarnet) {
  const injections: EventTable<ExportVaccinationInjection> = {
    entity: 'vaccinationInjection',
    events: data.vaccinationInjections,
    parentOf: ({ vaccinationId }) => vaccinationId,
    dateOf: ({ injectedOn }) => injectedOn,
    fileParents: data.vaccinations,
    localParents: local.vaccinations,
    localEvents: local.vaccinationInjections.map(
      ({ vaccinationId, injectedOn, ...event }): LocalEvent => ({
        ...event,
        parentId: vaccinationId,
        date: injectedOn,
      }),
    ),
  }
  const doses: EventTable<ExportTreatmentDose> = {
    entity: 'treatmentDose',
    events: data.treatmentDoses,
    parentOf: ({ treatmentId }) => treatmentId,
    dateOf: ({ givenOn }) => givenOn,
    fileParents: data.treatments,
    localParents: local.treatments,
    localEvents: local.treatmentDoses.map(({ treatmentId, givenOn, ...event }): LocalEvent => ({
      ...event,
      parentId: treatmentId,
      date: givenOn,
    })),
  }
  return { injections, doses }
}

function findReattached(data: ExportData, local: LocalCarnet): RefusedEntry | undefined {
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

function findMisplacedEvent<E extends { id: string; animalId: string }>(
  table: EventTable<E>,
  matchedById: boolean,
): RefusedEntry | undefined {
  const parents = new Map([...byId(table.localParents), ...byId(table.fileParents)])
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
    const existing = matchedById ? known.get(event.id) : undefined
    if (existing !== undefined && existing.parentId !== parent.id) return refused('reattached')
  }
  return undefined
}

/**
 * Traduit les entrées d'un fichier et l'état local en écritures à jouer, sans toucher à la base.
 *
 * `merge` : la version au `updatedAt` le plus récent gagne, à égalité l'appareil garde la sienne.
 * `replace` : tout le fichier est écrit, après effacement logique des données locales. Un vaccin,
 * un traitement, une pesée ne changent jamais d'animal, un événement jamais de parent : un fichier
 * qui en déplace un est refusé en entier, comme celui dont un événement n'a de parent ni dans le
 * fichier ni sur l'appareil. L'échéance d'un traitement est celle du fichier, jamais recalculée.
 * Un événement v2 se retrouve par son identifiant ; celui d'un fichier v1 met à jour l'événement
 * local de même date, ou en crée un : aucune date déjà en base n'est réécrite. En fusion, un parent
 * rendu visible revient avec les événements supprimés en même temps que lui.
 */
export function buildImportPlan({
  file: { schemaVersion, data },
  mode,
  local,
  photosOnDevice,
  importedAt,
  newId,
}: ImportPlanInput): ImportPlanResult {
  const matchedByDate = schemaVersion === 1
  const events = eventTables(data, local)
  const refused =
    findReattached(data, local) ??
    findMisplacedEvent(events.injections, !matchedByDate) ??
    findMisplacedEvent(events.doses, !matchedByDate)
  if (refused !== undefined) return { ok: false, refused }

  const replaceLocalData = mode === 'replace'
  const wins = (incoming: Stamped, existing: Stamped | undefined): boolean =>
    replaceLocalData ||
    existing === undefined ||
    Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)
  const dated = <T extends Stamped>(row: T, existing: Stamped | undefined): T =>
    existing === undefined ? row : { ...row, updatedAt: importedAt }

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
    if (wins(animal, existing)) {
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

  function planEntries<T extends Stamped & { animalId: string }>(
    rows: T[],
    versions: LocalEntry[],
  ): PlannedWrite<T>[] {
    const known = byId(versions)
    const planned: PlannedWrite<T>[] = []
    for (const row of rows) {
      if (!visibleAnimalIds.has(row.animalId)) continue
      const existing = known.get(row.id)
      const backWithItsAnimal = existing !== undefined && deletedWithItsAnimal(existing, cascades)
      if (wins(row, existing) || backWithItsAnimal) {
        planned.push({ row: dated(row, existing), exists: existing !== undefined })
      }
    }
    return planned
  }

  function planEvents<E extends Stamped>(
    table: EventTable<E>,
    parents: PlannedWrite<{ id: string }>[],
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
    const rank = (event: LocalEvent): number =>
      event.deletedAt === null ? 0 : withItsParent(event) ? 1 : 2
    const known = byId(table.localEvents)
    const byParent = eventsByParent(table.localEvents)
    const writes: PlannedWrite<E>[] = []
    const written = new Set<string>()

    function sameDate(parentId: string, date: string): LocalEvent | undefined {
      return (byParent.get(parentId) ?? [])
        .filter((event) => event.date === date)
        .sort(
          (a, b) =>
            rank(a) - rank(b) ||
            Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
            b.id.localeCompare(a.id),
        )[0]
    }

    for (const event of table.events) {
      const parentId = table.parentOf(event)
      if (!(matchedByDate ? plannedIds : visibleParentIds).has(parentId)) continue
      const match = matchedByDate ? sameDate(parentId, table.dateOf(event)) : known.get(event.id)

      if (match === undefined) {
        const id = matchedByDate && known.has(event.id) ? newId() : event.id
        writes.push({ row: { ...event, id }, exists: false })
        written.add(id)
      } else if (wins(event, match) || withItsParent(match)) {
        writes.push({ row: dated({ ...event, id: match.id }, match), exists: true })
        written.add(match.id)
      }
    }

    const revived = replaceLocalData
      ? []
      : table.localEvents
          .filter((event) => withItsParent(event) && !written.has(event.id))
          .map(({ id }) => id)
    return { writes, revived }
  }

  const vaccinations = planEntries(data.vaccinations, local.vaccinations)
  const treatments = planEntries(data.treatments, local.treatments)
  const injections = planEvents(events.injections, vaccinations)
  const doses = planEvents(events.doses, treatments)

  return {
    ok: true,
    plan: {
      replaceLocalData,
      animals,
      vaccinations,
      vaccinationInjections: injections.writes,
      revivedInjections: injections.revived,
      treatments,
      treatmentDoses: doses.writes,
      revivedDoses: doses.revived,
      weightEntries: planEntries(data.weightEntries, local.weightEntries),
    },
  }
}
