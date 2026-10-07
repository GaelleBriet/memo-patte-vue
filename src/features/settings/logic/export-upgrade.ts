import { z } from 'zod'

import {
  chainedDoses,
  frequencyOf,
  shiftsOfV3,
  type DoseLine,
  type PastDose,
} from './export-upgrade-doses'
import { EXPORT_SCHEMA_VERSION } from './export-format'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { MAX_WEIGHT_KG } from '@/shared/domain/weight-bounds'

/** Lignes d'un ancien export qui n'ont pas de place dans le format courant. */
export type ImportLosses = { injections: number; doses: number; weightEntries: number }

export type UpgradedExport = { document: Record<string, unknown>; lost: ImportLosses }

type Row = Record<string, unknown>
type Stamps = { createdByDevice: string; updatedByDevice: string }

const day = z.string().refine(isCalendarDay)
const row = z.looseObject({ id: z.string(), createdAt: z.string(), updatedAt: z.string() })
const rows = z.array(row)

const animalsV1 = z.array(
  row.extend({
    birthDate: z.string().nullable().optional(),
    initialWeightKg: z.unknown().optional(),
  }),
)
const treatmentsV1 = z.array(
  row.extend({
    animalId: z.string(),
    frequency: z.unknown(),
    stoppedOn: day.nullable().optional(),
  }),
)
const pastDose = row.extend({ givenOn: day, nextDueDate: day })

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
  treatments: z.array(treatmentsV1.element.extend({ lastDoseDate: day, nextDueDate: day })),
  weightEntries: rows,
})

const exportV2 = z.looseObject({
  schemaVersion: z.literal(2),
  animals: animalsV1,
  vaccinations: rows,
  vaccinationInjections: z.array(row.extend({ vaccinationId: z.string() })),
  treatments: treatmentsV1,
  treatmentDoses: z.array(pastDose.extend({ treatmentId: z.string() })),
  weightEntries: rows,
})

const exportV3 = z.looseObject({
  schemaVersion: z.literal(3),
  carnetSettings: z.looseObject({}).nullable(),
  animals: rows,
  vaccinations: rows,
  vaccinationInjections: rows,
  treatments: rows,
  treatmentPeriods: z.array(row.extend({ firstDueOn: z.unknown(), frequency: z.unknown() })),
  treatmentDoses: z.array(
    row.extend({
      periodId: z.string(),
      dueOn: day,
      dueTime: z.string().nullable(),
      givenOn: day.nullable(),
      status: z.string(),
      nextDueDate: day,
    }),
  ),
  weightEntries: rows,
})

type AnimalV1 = z.output<typeof animalsV1>[number]
type TreatmentV1 = z.output<typeof treatmentsV1>[number]

const NO_LOSS: ImportLosses = { injections: 0, doses: 0, weightEntries: 0 }

function without(line: Row, fields: string[]): Row {
  return Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)))
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

/** Le poids à l'arrivée devient une pesée du jour de création de l'animal (modèle v2, M7), en UTC. */
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
      measuredOn: createdAt.slice(0, 10),
      createdAt,
      updatedAt: createdAt,
    })
  }
  return { weighIns, lost }
}

function byGivenOn(a: PastDose, b: PastDose): number {
  return (
    a.givenOn.localeCompare(b.givenOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

/** Une seule période par traitement, à son identifiant, dont la première échéance est la première prise. */
function upgradeTreatment(
  treatment: TreatmentV1,
  pastDoses: PastDose[],
): { period: Row; doses: DoseLine[]; lost: number } {
  const { id, animalId, stoppedOn, createdAt, updatedAt } = treatment
  const doses = [...pastDoses].sort(byGivenOn)
  const firstDueOn = doses[0]?.givenOn ?? createdAt.slice(0, 10)
  const startsOn = stoppedOn && stoppedOn < firstDueOn ? stoppedOn : firstDueOn
  const period = {
    id,
    treatmentId: id,
    animalId,
    startsOn,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: null,
    stoppedOn: stoppedOn ?? null,
    frequency: treatment.frequency,
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt,
    updatedAt,
  }
  const frequency = frequencyOf(treatment.frequency)
  const sources = doses.map((dose) => ({
    ...(without(dose, ['frequency']) as PastDose),
    treatmentId: id,
    animalId,
  }))
  if (frequency === null) {
    return {
      period,
      doses: sources.map((dose) => ({
        ...dose,
        periodId: id,
        dueOn: dose.givenOn,
        dueTime: null,
        status: 'given',
      })),
      lost: 0,
    }
  }
  const { lines, lost } = chainedDoses({ id, firstDueOn }, frequency, sources)
  return { period, doses: lines, lost }
}

function treatmentOf(treatment: Row): Row {
  return without(treatment, ['frequency', 'stoppedOn', 'lastDoseDate', 'nextDueDate'])
}

function upgradeTreatments(
  treatments: TreatmentV1[],
  dosesOf: (treatmentId: string) => PastDose[],
): { treatments: Row[]; treatmentPeriods: Row[]; treatmentDoses: Row[]; lost: number } {
  const upgraded = treatments.map((treatment) => upgradeTreatment(treatment, dosesOf(treatment.id)))
  return {
    treatments: treatments.map(treatmentOf),
    treatmentPeriods: upgraded.map(({ period }) => period),
    treatmentDoses: upgraded.flatMap(({ doses }) => doses),
    lost: upgraded.reduce((total, { lost }) => total + lost, 0),
  }
}

function fromV1(file: z.output<typeof exportV1>): UpgradedExport {
  const { weighIns, lost } = arrivalWeighIns(file.animals)
  const lastDoses = new Map(
    file.treatments.map((treatment) => [
      treatment.id,
      [
        {
          id: treatment.id,
          givenOn: treatment.lastDoseDate,
          nextDueDate: treatment.nextDueDate,
          createdAt: treatment.createdAt,
          updatedAt: treatment.updatedAt,
        },
      ],
    ]),
  )
  const { lost: lostDoses, ...treatments } = upgradeTreatments(
    file.treatments,
    (treatmentId) => lastDoses.get(treatmentId) ?? [],
  )
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
      ...treatments,
      weightEntries: [...file.weightEntries, ...weighIns],
    },
    lost: { ...NO_LOSS, doses: lostDoses, weightEntries: lost },
  }
}

function groupBy<T>(lines: T[], keyOf: (line: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const line of lines) groups.set(keyOf(line), [...(groups.get(keyOf(line)) ?? []), line])
  return groups
}

function fromV2(file: z.output<typeof exportV2>): UpgradedExport {
  const { weighIns, lost } = arrivalWeighIns(file.animals)
  const vaccinationIds = new Set(file.vaccinations.map(({ id }) => id))
  const injections = file.vaccinationInjections.filter(({ vaccinationId }) =>
    vaccinationIds.has(vaccinationId),
  )
  const dosesByTreatment = groupBy(file.treatmentDoses, ({ treatmentId }) => treatmentId)
  const { lost: lostDoses, ...treatments } = upgradeTreatments(
    file.treatments,
    (treatmentId) => dosesByTreatment.get(treatmentId) ?? [],
  )
  const kept = file.treatments.reduce(
    (total, { id }) => total + (dosesByTreatment.get(id)?.length ?? 0),
    0,
  )
  return {
    document: {
      carnetSettings: null,
      animals: file.animals.map(upgradeAnimal),
      vaccinations: file.vaccinations.map((vaccination) => ({
        ...vaccination,
        plannedDueDate: null,
      })),
      vaccinationInjections: injections,
      ...treatments,
      weightEntries: [...file.weightEntries, ...weighIns],
    },
    lost: {
      injections: file.vaccinationInjections.length - injections.length,
      doses: file.treatmentDoses.length - kept + lostDoses,
      weightEntries: lost,
    },
  }
}

function fromV3(file: z.output<typeof exportV3>): UpgradedExport {
  const frequencies = new Map(
    file.treatmentPeriods.map(({ id, frequency }) => [id, frequencyOf(frequency)]),
  )
  const doses = file.treatmentDoses as DoseLine[]
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
      treatmentDoses: [...doses, ...shiftsOfV3(doses, frequencies)],
      weightEntries: file.weightEntries,
    },
    lost: NO_LOSS,
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
