import type {
  ExportAnimal,
  ExportData,
  ExportTreatment,
  ExportVaccination,
  ExportWeightEntry,
} from './carnet-data'

export type ImportMode = 'merge' | 'replace'

type Stamped = { id: string; updatedAt: string }

export type LocalAnimal = Stamped & { deletedAt: string | null; photoPath: string | null }
export type LocalEntry = Stamped & { deletedAt: string | null; animalId: string }

export type LocalCarnet = {
  animals: LocalAnimal[]
  vaccinations: LocalEntry[]
  treatments: LocalEntry[]
  weightEntries: LocalEntry[]
}

export type ImportedAnimal = Omit<ExportAnimal, 'photoFileName'> & { photoPath: string | null }

export type PlannedWrite<T> = { row: T; exists: boolean }

export type ImportPlan = {
  replaceLocalData: boolean
  animals: PlannedWrite<ImportedAnimal>[]
  vaccinations: PlannedWrite<ExportVaccination>[]
  treatments: PlannedWrite<ExportTreatment>[]
  weightEntries: PlannedWrite<ExportWeightEntry>[]
}

export type ImportEntity = 'vaccination' | 'treatment' | 'weightEntry'

export type ReattachedEntry = { entity: ImportEntity; id: string }

export type ImportPlanResult =
  { ok: true; plan: ImportPlan } | { ok: false; reattached: ReattachedEntry }

export type ImportPlanInput = {
  data: ExportData
  mode: ImportMode
  local: LocalCarnet
  photosOnDevice: ReadonlySet<string>
  importedAt: string
}

/** Date de suppression d'un animal dont le fichier rend une version plus récente, par identifiant. */
export type CascadeDeletions = ReadonlyMap<string, string>

/**
 * Un animal et son carnet supprimés ensemble portent exactement le même `deletedAt`
 * (`animal-deletion.service.ts`) : c'est cette égalité qui distingue une entrée emportée par la
 * cascade d'une entrée supprimée à part, qui doit rester supprimée.
 */
export function deletedWithItsAnimal(entry: LocalEntry, cascades: CascadeDeletions): boolean {
  return entry.deletedAt !== null && entry.deletedAt === cascades.get(entry.animalId)
}

const ENTRY_TABLES = [
  ['vaccination', 'vaccinations'],
  ['treatment', 'treatments'],
  ['weightEntry', 'weightEntries'],
] as const

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function findReattached(data: ExportData, local: LocalCarnet): ReattachedEntry | undefined {
  for (const [entity, table] of ENTRY_TABLES) {
    const known = byId(local[table])
    for (const row of data[table]) {
      const existing = known.get(row.id)
      if (existing !== undefined && existing.animalId !== row.animalId) {
        return { entity, id: row.id }
      }
    }
  }
  return undefined
}

/**
 * Traduit les entrées d'un fichier et l'état local en écritures à jouer, sans toucher à la base.
 *
 * `merge` : la version au `updatedAt` le plus récent gagne, à égalité l'appareil garde la sienne.
 * `replace` : tout le fichier est écrit, après effacement logique des données locales. Un vaccin,
 * un traitement, une pesée ne changent jamais d'animal : un fichier qui en déplace un est refusé
 * en entier. L'échéance d'un traitement est celle du fichier, jamais recalculée.
 */
export function buildImportPlan({
  data,
  mode,
  local,
  photosOnDevice,
  importedAt,
}: ImportPlanInput): ImportPlanResult {
  const reattached = findReattached(data, local)
  if (reattached !== undefined) return { ok: false, reattached }

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

  return {
    ok: true,
    plan: {
      replaceLocalData,
      animals,
      vaccinations: planEntries(data.vaccinations, local.vaccinations),
      treatments: planEntries(data.treatments, local.treatments),
      weightEntries: planEntries(data.weightEntries, local.weightEntries),
    },
  }
}
