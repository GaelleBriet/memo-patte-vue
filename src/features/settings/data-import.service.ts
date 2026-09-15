import { photoDisplayUrl } from '@/core/photos/photo-storage'
import { syncAllReminders } from '@/app/reminders-sync'
import {
  getAnimalsRepository,
  type AnimalsRepository,
  type AnimalVersion,
} from '@/features/animals/animals.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { getWeightRepository, type WeightRepository } from '@/features/weight/weight.repository'
import type { ExportAnimal, ExportData } from './export-format'

type Provider<T> = () => T | Promise<T>

export type ImportMode = 'merge' | 'replace'

type SqlStatement = ReturnType<AnimalsRepository['markAllDeletedStatement']>

type ImportMethods = 'listVersions' | 'markAllDeletedStatement' | 'restoreStatement'

type Stamped = { id: string; updatedAt: string }

export type DataImportDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list' | 'runImport' | ImportMethods>>
  vaccinations: Provider<Pick<VaccinationsRepository, ImportMethods>>
  treatments: Provider<Pick<TreatmentsRepository, ImportMethods>>
  weight: Provider<Pick<WeightRepository, ImportMethods>>
  photoExists: (fileName: string) => Promise<boolean>
  syncReminders: () => Promise<void>
  now: () => Date
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

export function createDataImportService({
  animals,
  vaccinations,
  treatments,
  weight,
  photoExists,
  syncReminders,
  now,
}: DataImportDependencies) {
  /** Les photos ne voyagent pas dans l'export : l'import n'en retire jamais une déjà sur l'appareil. */
  async function resolvePhoto(animal: ExportAnimal, local: AnimalVersion | undefined) {
    if (animal.photoFileName !== null && (await photoExists(animal.photoFileName))) {
      return animal.photoFileName
    }
    return local?.photoPath ?? null
  }

  return {
    async hasLocalData(): Promise<boolean> {
      return (await (await animals()).list()).length > 0
    },

    /**
     * Tout ou rien, en une transaction. `merge` : la version la plus récente (`updatedAt`) d'une
     * même entrée gagne, suppression locale comprise. `replace` : les données locales sont
     * marquées supprimées, celles du fichier reprises telles quelles. Lève si l'écriture échoue.
     */
    async importData(data: ExportData, mode: ImportMode): Promise<void> {
      const [animalsRepository, vaccinationsRepository, treatmentsRepository, weightRepository] =
        await Promise.all([animals(), vaccinations(), treatments(), weight()])
      const [animalVersions, vaccinationVersions, treatmentVersions, weightVersions] =
        await Promise.all([
          animalsRepository.listVersions(),
          vaccinationsRepository.listVersions(),
          treatmentsRepository.listVersions(),
          weightRepository.listVersions(),
        ])

      const replace = mode === 'replace'
      const deletedAt = now().toISOString()
      const wins = (incoming: Stamped, local: Stamped | undefined) =>
        replace ||
        local === undefined ||
        Date.parse(incoming.updatedAt) > Date.parse(local.updatedAt)

      const statements: SqlStatement[] = replace
        ? [
            animalsRepository.markAllDeletedStatement(deletedAt),
            vaccinationsRepository.markAllDeletedStatement(deletedAt),
            treatmentsRepository.markAllDeletedStatement(deletedAt),
            weightRepository.markAllDeletedStatement(deletedAt),
          ]
        : []

      const localAnimals = byId(animalVersions)
      const visibleAnimalIds = new Set<string>()
      for (const animal of data.animals) {
        const local = localAnimals.get(animal.id)
        if (wins(animal, local)) {
          const { photoFileName: _, ...fields } = animal
          const photoPath = await resolvePhoto(animal, local)
          statements.push(
            animalsRepository.restoreStatement({ ...fields, photoPath }, local !== undefined),
          )
          visibleAnimalIds.add(animal.id)
        } else if (local?.deletedAt === null) {
          visibleAnimalIds.add(animal.id)
        }
      }

      function restoreRecords<T extends Stamped & { animalId: string }>(
        rows: T[],
        versions: Stamped[],
        restoreStatement: (row: T, exists: boolean) => SqlStatement,
      ): void {
        const local = byId(versions)
        for (const row of rows) {
          if (!visibleAnimalIds.has(row.animalId)) continue
          const existing = local.get(row.id)
          if (wins(row, existing)) statements.push(restoreStatement(row, existing !== undefined))
        }
      }

      restoreRecords(
        data.vaccinations,
        vaccinationVersions,
        vaccinationsRepository.restoreStatement,
      )
      restoreRecords(data.treatments, treatmentVersions, treatmentsRepository.restoreStatement)
      restoreRecords(data.weightEntries, weightVersions, weightRepository.restoreStatement)

      await animalsRepository.runImport(statements)
      await syncReminders()
    },
  }
}

export type DataImportService = ReturnType<typeof createDataImportService>

export const dataImportService = createDataImportService({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  weight: getWeightRepository,
  photoExists: (fileName) =>
    photoDisplayUrl(fileName).then(
      () => true,
      () => false,
    ),
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
