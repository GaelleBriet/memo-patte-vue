import { format, isValid, parseISO } from 'date-fns'
import { z } from 'zod'

import { EXPORT_SCHEMA_VERSION } from './export-format'
import { MAX_WEIGHT_KG } from '@/shared/domain/weight-bounds'

/** Lignes d'un ancien export qui n'ont pas de place dans le format courant. */
export type ImportLosses = { injections: number; doses: number; weightEntries: number }

export type UpgradedExport = { document: Record<string, unknown>; lost: ImportLosses }

type Row = Record<string, unknown>
type Stamps = { createdByDevice: string; updatedByDevice: string }

const row = z.looseObject({ id: z.string(), createdAt: z.string(), updatedAt: z.string() })
const rows = z.array(row)

const animalsV1 = z.array(
  row.extend({ birthDate: z.string().nullable().optional(), initialWeightKg: z.unknown() }),
)
const treatmentsV1 = z.array(
  row.extend({
    animalId: z.string(),
    frequency: z.unknown(),
    stoppedOn: z.string().nullable().optional(),
  }),
)

const exportV1 = z.looseObject({
  schemaVersion: z.literal(1),
  animals: animalsV1,
  vaccinations: z.array(
    row.extend({
      animalId: z.string(),
      lastInjectionDate: z.unknown(),
      dueDate: z.unknown(),
    }),
  ),
  treatments: z.array(
    treatmentsV1.element.extend({ lastDoseDate: z.string(), nextDueDate: z.unknown() }),
  ),
  weightEntries: rows,
})

const exportV2 = z.looseObject({
  schemaVersion: z.literal(2),
  animals: animalsV1,
  vaccinations: rows,
  vaccinationInjections: z.array(row.extend({ vaccinationId: z.string() })),
  treatments: treatmentsV1,
  treatmentDoses: z.array(row.extend({ treatmentId: z.string(), givenOn: z.string() })),
  weightEntries: rows,
})

const exportV3 = z.looseObject({
  schemaVersion: z.literal(3),
  carnetSettings: z.looseObject({}).nullable(),
  animals: rows,
  vaccinations: rows,
  vaccinationInjections: rows,
  treatments: rows,
  treatmentPeriods: z.array(row.extend({ firstDueOn: z.unknown() })),
  treatmentDoses: rows,
  weightEntries: rows,
})

type AnimalV1 = z.output<typeof animalsV1>[number]
type TreatmentV1 = z.output<typeof treatmentsV1>[number]

function dayOf(instant: string): string {
  const date = parseISO(instant)
  return isValid(date) ? format(date, 'yyyy-MM-dd') : instant
}

function earliest(days: string[]): string {
  return days.reduce((first, day) => (day < first ? day : first))
}

function isWeight(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= MAX_WEIGHT_KG
}

function upgradeAnimal(animal: AnimalV1): Row {
  return {
    ...without(animal, ['initialWeightKg']),
    birthDate: animal.birthDate ?? null,
    birthDateApproximate: false,
    unfollowedOn: null,
    departureReason: null,
    departureDate: null,
  }
}

/** Le poids à l'arrivée devient une pesée du jour de création de l'animal (modèle v2, M7). */
function arrivalWeighIns(animals: AnimalV1[]): { weighIns: Row[]; lost: number } {
  const weighIns: Row[] = []
  let lost = 0
  for (const { id, initialWeightKg, createdAt } of animals) {
    if (initialWeightKg === null || initialWeightKg === undefined) continue
    if (!isWeight(initialWeightKg)) {
      lost++
      continue
    }
    weighIns.push({
      id,
      animalId: id,
      weightKg: initialWeightKg,
      measuredOn: dayOf(createdAt),
      createdAt,
      updatedAt: createdAt,
    })
  }
  return { weighIns, lost }
}

/** Une seule période par traitement, à son identifiant, ouverte à la première prise connue. */
function periodOf(
  { id, animalId, frequency, stoppedOn, createdAt, updatedAt }: TreatmentV1,
  doseDays: string[],
): Row {
  const known = [...doseDays, ...(stoppedOn ? [stoppedOn] : [])]
  const startsOn = known.length > 0 ? earliest(known) : dayOf(createdAt)
  return {
    id,
    treatmentId: id,
    animalId,
    startsOn,
    firstDueOn: startsOn,
    referenceOn: startsOn,
    endsOn: null,
    stoppedOn: stoppedOn ?? null,
    frequency,
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt,
    updatedAt,
  }
}

function without(line: Row, fields: string[]): Row {
  return Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)))
}

function treatmentOf(treatment: Row): Row {
  return without(treatment, ['frequency', 'stoppedOn', 'lastDoseDate', 'nextDueDate'])
}

function givenDose(dose: Row & { treatmentId: string; givenOn: string }): Row {
  return {
    ...dose,
    periodId: dose.treatmentId,
    dueOn: dose.givenOn,
    dueTime: null,
    status: 'given',
  }
}

function fromV1(file: z.output<typeof exportV1>): UpgradedExport {
  const { weighIns, lost } = arrivalWeighIns(file.animals)
  return {
    document: {
      carnetSettings: null,
      animals: file.animals.map(upgradeAnimal),
      vaccinations: file.vaccinations.map((vaccination) => ({
        ...without(vaccination, ['lastInjectionDate', 'dueDate']),
        plannedDueDate: null,
      })),
      vaccinationInjections: file.vaccinations.map((vaccination) => ({
        id: vaccination.id,
        vaccinationId: vaccination.id,
        animalId: vaccination.animalId,
        injectedOn: vaccination.lastInjectionDate,
        nextDueDate: vaccination.dueDate,
        createdAt: vaccination.createdAt,
        updatedAt: vaccination.updatedAt,
      })),
      treatments: file.treatments.map(treatmentOf),
      treatmentPeriods: file.treatments.map((treatment) =>
        periodOf(treatment, [treatment.lastDoseDate]),
      ),
      treatmentDoses: file.treatments.map((treatment) =>
        givenDose({
          id: treatment.id,
          treatmentId: treatment.id,
          animalId: treatment.animalId,
          givenOn: treatment.lastDoseDate,
          nextDueDate: treatment.nextDueDate,
          createdAt: treatment.createdAt,
          updatedAt: treatment.updatedAt,
        }),
      ),
      weightEntries: [...file.weightEntries, ...weighIns],
    },
    lost: { injections: 0, doses: 0, weightEntries: lost },
  }
}

function fromV2(file: z.output<typeof exportV2>): UpgradedExport {
  const { weighIns, lost } = arrivalWeighIns(file.animals)
  const vaccinationIds = new Set(file.vaccinations.map(({ id }) => id))
  const injections = file.vaccinationInjections.filter(({ vaccinationId }) =>
    vaccinationIds.has(vaccinationId),
  )
  const treatmentIds = new Set(file.treatments.map(({ id }) => id))
  const doses = file.treatmentDoses.filter(({ treatmentId }) => treatmentIds.has(treatmentId))
  return {
    document: {
      carnetSettings: null,
      animals: file.animals.map(upgradeAnimal),
      vaccinations: file.vaccinations.map((vaccination) => ({
        ...vaccination,
        plannedDueDate: null,
      })),
      vaccinationInjections: injections,
      treatments: file.treatments.map(treatmentOf),
      treatmentPeriods: file.treatments.map((treatment) =>
        periodOf(
          treatment,
          doses
            .filter(({ treatmentId }) => treatmentId === treatment.id)
            .map(({ givenOn }) => givenOn),
        ),
      ),
      treatmentDoses: doses.map((dose) => without(givenDose(dose), ['frequency'])),
      weightEntries: [...file.weightEntries, ...weighIns],
    },
    lost: {
      injections: file.vaccinationInjections.length - injections.length,
      doses: file.treatmentDoses.length - doses.length,
      weightEntries: lost,
    },
  }
}

function fromV3(file: z.output<typeof exportV3>): UpgradedExport {
  return {
    document: {
      carnetSettings: file.carnetSettings,
      animals: file.animals,
      vaccinations: file.vaccinations,
      vaccinationInjections: file.vaccinationInjections,
      treatments: file.treatments,
      treatmentPeriods: file.treatmentPeriods.map((period) => ({
        ...period,
        referenceOn: period.firstDueOn,
      })),
      treatmentDoses: file.treatmentDoses,
      weightEntries: file.weightEntries,
    },
    lost: { injections: 0, doses: 0, weightEntries: 0 },
  }
}

const TABLES = [
  'animals',
  'vaccinations',
  'vaccinationInjections',
  'treatments',
  'treatmentPeriods',
  'treatmentDoses',
  'weightEntries',
] as const

function stamped({ document, lost }: UpgradedExport, stamps: Stamps, source: Row): UpgradedExport {
  const settings = document.carnetSettings as Row | null
  return {
    document: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: source.exportedAt,
      appVersion: source.appVersion,
      carnetSettings: settings && { ...settings, ...stamps },
      ...Object.fromEntries(
        TABLES.map((table) => [
          table,
          (document[table] as Row[]).map((line) => ({ ...line, ...stamps })),
        ]),
      ),
      devices: [],
    },
    lost,
  }
}

function converted(document: unknown): UpgradedExport | null {
  const v1 = exportV1.safeParse(document)
  if (v1.success) return fromV1(v1.data)
  const v2 = exportV2.safeParse(document)
  if (v2.success) return fromV2(v2.data)
  const v3 = exportV3.safeParse(document)
  if (v3.success) return fromV3(v3.data)
  return null
}

/**
 * Réécrit un export v1, v2 ou v3 au format courant, que l'import valide ensuite comme un fichier
 * récent. Les lignes ajoutées depuis prennent l'appareil qui importe ; `null` : fichier illisible.
 */
export function upgradeExport(document: unknown, deviceId: string): UpgradedExport | null {
  const upgraded = converted(document)
  if (upgraded === null) return null
  const stamps = { createdByDevice: deviceId, updatedByDevice: deviceId }
  return stamped(upgraded, stamps, document as Row)
}
