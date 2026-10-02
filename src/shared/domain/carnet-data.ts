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
  birthDateApproximate: boolean
  photoFileName: string | null
  /** `null` tant que l'animal est suivi. */
  unfollowedOn: string | null
  departureReason: 'death' | 'rehomed' | 'other' | null
  departureDate: string | null
  createdAt: string
  updatedAt: string
}

export type ExportVaccination = {
  id: string
  animalId: string
  name: string
  /** Rappel prévu, lu tant que le vaccin n'a aucune injection. */
  plannedDueDate: string | null
  createdAt: string
  updatedAt: string
}

export type ExportVaccinationInjection = {
  id: string
  vaccinationId: string
  animalId: string
  injectedOn: string
  nextDueDate: string | null
  createdAt: string
  updatedAt: string
}

export type ExportFrequency = { value: number; unit: 'day' | 'week' | 'month' }

export type ExportTreatment = {
  id: string
  animalId: string
  name: string
  type: 'deworming' | 'antiparasitic' | 'medication'
  createdAt: string
  updatedAt: string
}

export type ExportDoseUnit =
  | 'tablet'
  | 'capsule'
  | 'pipette'
  | 'collar'
  | 'ml'
  | 'drop'
  | 'g'
  | 'sachet'
  | 'spray'
  | 'application'
  | 'dose'

export type ExportTreatmentPeriod = {
  id: string
  treatmentId: string
  animalId: string
  startsOn: string
  firstDueOn: string
  endsOn: string | null
  stoppedOn: string | null
  frequency: ExportFrequency
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: string[]
  doseQuantity: number | null
  doseUnit: ExportDoseUnit | null
  reminderOffsetMinutes: 0 | 15 | 30 | 60 | null
  reminderTime: string | null
  createdAt: string
  updatedAt: string
}

export type ExportTreatmentDose = {
  id: string
  periodId: string
  treatmentId: string
  animalId: string
  dueOn: string
  dueTime: string | null
  /** `null` pour une prise oubliée ou reportée. */
  givenOn: string | null
  status: 'given' | 'missed' | 'postponed'
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

export type ExportCarnetSettings = {
  vaccineReminderTime: string
  remindBeforeDue: boolean
  createdAt: string
  updatedAt: string
}

export type ExportData = {
  /** `null` tant que rien n'a été réglé : les valeurs par défaut s'appliquent. */
  carnetSettings: ExportCarnetSettings | null
  animals: ExportAnimal[]
  vaccinations: ExportVaccination[]
  vaccinationInjections: ExportVaccinationInjection[]
  treatments: ExportTreatment[]
  treatmentPeriods: ExportTreatmentPeriod[]
  treatmentDoses: ExportTreatmentDose[]
  weightEntries: ExportWeightEntry[]
}
