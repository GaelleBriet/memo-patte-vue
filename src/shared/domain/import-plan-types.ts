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

export type ImportFile = { schemaVersion: 11; data: ExportData }

export type Versioned = { id: string; updatedAt: string }
type Deletable = Versioned & { deletedAt: string | null }

export type LocalAnimal = Deletable & { photoPath: string | null }
export type LocalEntry = Deletable & { animalId: string }
export type LocalInjection = Deletable & { vaccinationId: string }
export type LocalPeriod = LocalEntry & { treatmentId: string }
export type LocalDose = Deletable & { periodId: string; treatmentId: string }
type LocalSettings = { updatedAt: string; deletedAt: string | null }
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
