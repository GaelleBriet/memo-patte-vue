/**
 * Les lignes du carnet telles qu'elles voyagent : fichier d'export (`export-format.ts`) aujourd'hui,
 * miroir Postgres de la synchronisation demain. Mêmes champs que les tables SQLite, sans `deletedAt`.
 */
export type ExportAnimal = {
  id: string
  name: string
  species: 'dog' | 'cat'
  breed: string | null
  birthDate: string | null
  initialWeightKg: number | null
  photoFileName: string | null
  createdAt: string
  updatedAt: string
}

export type ExportVaccination = {
  id: string
  animalId: string
  name: string
  lastInjectionDate: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type ExportTreatment = {
  id: string
  animalId: string
  name: string
  type: 'deworming' | 'antiparasitic'
  frequency: { value: number; unit: 'day' | 'week' | 'month' }
  lastDoseDate: string
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

export type ExportWeightEntry = {
  id: string
  animalId: string
  weightKg: number
  measuredOn: string
  createdAt: string
  updatedAt: string
}

export type ExportData = {
  animals: ExportAnimal[]
  vaccinations: ExportVaccination[]
  treatments: ExportTreatment[]
  weightEntries: ExportWeightEntry[]
}
