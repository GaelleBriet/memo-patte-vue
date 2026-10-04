import type {
  ExportAnimal,
  ExportCarnetSettings,
  ExportData,
  ExportDevice,
  ExportTreatment,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccination,
  ExportVaccinationInjection,
  ExportWeightEntry,
} from './carnet-data'

export type ImportMode = 'merge' | 'replace'

export type ImportFile = { schemaVersion: 4; data: ExportData }

type Versioned = { id: string; updatedAt: string }
type Deletable = Versioned & { deletedAt: string | null }

export type LocalAnimal = Deletable & { photoPath: string | null }
export type LocalEntry = Deletable & { animalId: string }
export type LocalInjection = Deletable & { vaccinationId: string }
export type LocalPeriod = LocalEntry & { treatmentId: string }
export type LocalDose = Deletable & { periodId: string; treatmentId: string }
export type LocalSettings = { updatedAt: string; deletedAt: string | null }
export type LocalDevice = Deletable

export type LocalCarnet = {
  carnetSettings: LocalSettings | null
  animals: LocalAnimal[]
  vaccinations: LocalEntry[]
  vaccinationInjections: LocalInjection[]
  treatments: LocalEntry[]
  treatmentPeriods: LocalPeriod[]
  treatmentDoses: LocalDose[]
  weightEntries: LocalEntry[]
  devices: LocalDevice[]
}

export type LocalEvent = Deletable & { parentId: string }

export type ImportedAnimal = Omit<ExportAnimal, 'photoFileName'> & { photoPath: string | null }

export type PlannedWrite<T> = { row: T; exists: boolean }

export type ImportPlan = {
  replaceLocalData: boolean
  /** `null` : le fichier n'écrit pas les réglages du carnet. */
  carnetSettings: ExportCarnetSettings | null
  animals: PlannedWrite<ImportedAnimal>[]
  vaccinations: PlannedWrite<ExportVaccination>[]
  vaccinationInjections: PlannedWrite<ExportVaccinationInjection>[]
  revivedInjections: string[]
  treatments: PlannedWrite<ExportTreatment>[]
  treatmentPeriods: PlannedWrite<ExportTreatmentPeriod>[]
  revivedPeriods: string[]
  treatmentDoses: PlannedWrite<ExportTreatmentDose>[]
  revivedDoses: string[]
  weightEntries: PlannedWrite<ExportWeightEntry>[]
  /** Jamais effacés, même en remplacement : ils nomment les appareils des lignes du carnet. */
  devices: PlannedWrite<ExportDevice>[]
}

export type ImportEntity =
  | 'vaccination'
  | 'vaccinationInjection'
  | 'treatment'
  | 'treatmentPeriod'
  | 'treatmentDose'
  | 'weightEntry'

/**
 * `reattached` : une entrée change d'animal, une injection, une période ou une prise change de
 * parent ou n'a pas l'animal de son parent, une prise vise la période d'un autre traitement.
 * `orphanEvent` : ni le fichier ni l'appareil n'ont le parent d'une de ces lignes.
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
  /** L'appareil qui importe : il devient l'auteur de toute ligne déjà présente qu'il réécrit. */
  deviceId: string
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

/** Même règle un étage plus bas : un vaccin ou un traitement et ses lignes supprimés ensemble. */
export function deletedWithItsParent(event: LocalEvent, parentCascades: CascadeDeletions): boolean {
  return event.deletedAt !== null && event.deletedAt === parentCascades.get(event.parentId)
}

const ENTRY_TABLES = [
  ['vaccination', 'vaccinations'],
  ['treatment', 'treatments'],
  ['weightEntry', 'weightEntries'],
] as const

type Parent = { id: string; animalId: string }

type EventTable<E> = {
  entity: ImportEntity
  events: E[]
  parentOf: (event: E) => string
  fileParents: Parent[]
  localParents: LocalEntry[]
  localEvents: LocalEvent[]
}

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function eventTables(data: ExportData, local: LocalCarnet) {
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

function findMisplacedEvent<E extends Parent>(table: EventTable<E>): RefusedEntry | undefined {
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
function findMisplacedDose(data: ExportData, local: LocalCarnet): RefusedEntry | undefined {
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
