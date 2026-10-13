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
import { gridOriginsOf, targetOnOf } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'

type Unstamped<T> = Omit<T, 'createdByDevice' | 'updatedByDevice'>

export type Version4Period = Omit<ExportTreatmentPeriod, 'gridOriginOn'> & { referenceOn: string }
export type Version4Dose = Omit<ExportTreatmentDose, 'targetOn'> & { nextDueDate: string }

export type Version4Data = Omit<ExportData, 'treatmentPeriods' | 'treatmentDoses'> & {
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
export function fromVersion4(data: Version4Data): ExportData {
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
