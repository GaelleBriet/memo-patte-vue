import type {
  ExportAnimal,
  ExportCarnetSettings,
  ExportData,
  ExportTreatment,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccination,
  ExportVaccinationInjection,
  ExportWeightEntry,
} from '@/shared/domain/carnet-data'
import { gridOriginsOf, legacyFactsOf, targetOnOf } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'

type Unstamped<T> = Omit<T, 'createdByDevice' | 'updatedByDevice'>

export type Version8Dose = Omit<
  ExportTreatmentDose,
  'previousTargetOn' | 'previousTargetTime' | 'dueRank'
>

export type Version9Period = Omit<ExportTreatmentPeriod, 'gridWrittenAt'>

export type Version9Data = Omit<ExportData, 'treatmentPeriods'> & {
  treatmentPeriods: Version9Period[]
}

export type Version8Data = Omit<Version9Data, 'treatmentDoses'> & {
  treatmentDoses: Version8Dose[]
}

export type Version7Period = Omit<Version9Period, 'fallenDosesAnswer'> & {
  pastDosesStayUnlogged: boolean
}

export type Version7Data = Omit<Version8Data, 'treatmentPeriods'> & {
  treatmentPeriods: Version7Period[]
}

export type Version6Period = Omit<Version7Period, 'settingsWrittenAt'>

export type Version6Data = Omit<Version8Data, 'treatmentPeriods'> & {
  treatmentPeriods: Version6Period[]
}

export type Version5Period = Omit<Version6Period, 'firstDueChosen' | 'pastDosesStayUnlogged'>

export type Version5Data = Omit<Version8Data, 'treatmentPeriods'> & {
  treatmentPeriods: Version5Period[]
}

export type Version4Period = Omit<Version5Period, 'gridOriginOn'> & { referenceOn: string }
export type Version4Dose = Omit<Version8Dose, 'targetOn'> & { nextDueDate: string }

export type Version4Data = Omit<Version5Data, 'treatmentPeriods' | 'treatmentDoses'> & {
  treatmentPeriods: Version4Period[]
  treatmentDoses: Version4Dose[]
}

export type Version3Data = {
  carnetSettings: Unstamped<ExportCarnetSettings> | null
  animals: Unstamped<ExportAnimal>[]
  vaccinations: Unstamped<ExportVaccination>[]
  vaccinationInjections: Unstamped<ExportVaccinationInjection>[]
  treatments: Unstamped<ExportTreatment>[]
  treatmentPeriods: Unstamped<Omit<Version4Period, 'referenceOn'>>[]
  treatmentDoses: Unstamped<Version4Dose>[]
  weightEntries: Unstamped<ExportWeightEntry>[]
}

/** Le format v3 n'a ni appareil ni référence : l'appareil qui importe signe chaque ligne, la grille part de la première échéance. */
export function fromVersion3(data: Version3Data, deviceId: string): Version4Data {
  const signed = <T>(row: T) => ({ ...row, createdByDevice: deviceId, updatedByDevice: deviceId })
  return {
    carnetSettings: data.carnetSettings === null ? null : signed(data.carnetSettings),
    animals: data.animals.map(signed),
    vaccinations: data.vaccinations.map(signed),
    vaccinationInjections: data.vaccinationInjections.map(signed),
    treatments: data.treatments.map(signed),
    treatmentPeriods: data.treatmentPeriods.map((period) =>
      signed({ ...period, referenceOn: period.firstDueOn }),
    ),
    treatmentDoses: data.treatmentDoses.map(signed),
    weightEntries: data.weightEntries.map(signed),
    devices: [],
  }
}

/** Plan §3.3 : la conversion que la migration v12 applique à la base, traitement par traitement. */
export function fromVersion4(data: Version4Data): Version5Data {
  const treatmentIds = new Set(data.treatmentPeriods.map(({ treatmentId }) => treatmentId))
  const origins = new Map(
    [...treatmentIds].flatMap((id) => [
      ...gridOriginsOf(data.treatmentPeriods.filter(({ treatmentId }) => treatmentId === id)),
    ]),
  )
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map((period) => {
      const { referenceOn: _, ...kept } = period
      return { ...kept, gridOriginOn: origins.get(period.id) ?? null }
    }),
    treatmentDoses: data.treatmentDoses.map(({ nextDueDate, ...dose }) => ({
      ...dose,
      targetOn: targetOnOf({ status: dose.status, nextDueDate }),
    })),
  }
}

/** La conversion que la migration v13 applique à la base : chaque réglage se relit comme avant. */
export function fromVersion5(data: Version5Data): Version6Data {
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map((period) => ({
      ...period,
      firstDueChosen: legacyFactsOf(period.gridOriginOn).firstDueChosen,
      pastDosesStayUnlogged: false,
    })),
  }
}

/** La conversion que la migration v14 applique à la base : date d'écriture inconnue, lue comme jamais réécrit. */
export function fromVersion6(data: Version6Data): Version7Data {
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map((period) => ({
      ...period,
      settingsWrittenAt: period.createdAt,
    })),
  }
}

/** La conversion que la migration v15 applique à la base : rien ne passe à « n'étaient pas à donner ». */
export function fromVersion7(data: Version7Data): Version8Data {
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map(({ pastDosesStayUnlogged, ...period }) => ({
      ...period,
      fallenDosesAnswer: pastDosesStayUnlogged ? 'stay-unlogged' : 'unasked',
    })),
  }
}

/** La conversion que la migration v16 applique à une ligne écrite sans elle : arrivée d'avant et rang inconnus. */
export function fromVersion8(data: Version8Data): Version9Data {
  return {
    ...data,
    treatmentDoses: data.treatmentDoses.map((dose) => ({
      ...dose,
      previousTargetOn: null,
      previousTargetTime: null,
      dueRank: null,
    })),
  }
}

/** La conversion que la migration v17 applique à la base : la grille datée de la dernière écriture des réglages. */
export function fromVersion9(data: Version9Data): ExportData {
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map((period) => ({
      ...period,
      gridWrittenAt: period.settingsWrittenAt,
    })),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Comme le serveur : une date de grille hors bornes s'écrête, le fichier n'est jamais refusé pour elle. */
export function withGridDatesClamped(data: ExportData, exportedAt: string): ExportData {
  const latest = Date.parse(exportedAt) + DAY_MS
  return {
    ...data,
    treatmentPeriods: data.treatmentPeriods.map((period) => {
      const at = Date.parse(period.gridWrittenAt)
      if (at > latest) return { ...period, gridWrittenAt: exportedAt }
      if (at < Date.parse(period.createdAt)) return { ...period, gridWrittenAt: period.createdAt }
      return period
    }),
  }
}

/** Q40 : l'import relit chaque traitement par le moteur avant d'écrire. */
export function everyTreatmentReadable(data: ExportData, today: string): boolean {
  return data.treatments.every(
    ({ id }) =>
      readTreatment(
        {
          periods: data.treatmentPeriods.filter(({ treatmentId }) => treatmentId === id),
          doses: data.treatmentDoses.filter(({ treatmentId }) => treatmentId === id),
        },
        today,
      ) !== null,
  )
}
