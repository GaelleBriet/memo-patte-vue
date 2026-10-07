import { describe, expect, it } from 'vitest'

import { exportReminders, toCsvTables, toJsonExport } from '../logic/export-format'
import { buildCarnetPdfContent } from '../logic/pdf-content'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { animalOf, BY_FIXTURE_DEVICE, periodOf } from './export-fixture'
import { readPdfPages } from './pdf-reader'
import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import {
  treatmentSchedule,
  type DoseFields,
  type LineChange,
} from '@/shared/domain/treatment-schedule'

const MILO = '11111111-1111-4111-8111-111111111111'
const AT = '2026-09-01T08:00:00.000Z'
const DAILY = { value: 1, unit: 'day' } as const
const WEEKLY = { value: 1, unit: 'week' } as const

function period(
  fields: Partial<ExportTreatmentPeriod> & { startsOn: string },
): ExportTreatmentPeriod {
  return periodOf({
    id: 'p-1',
    treatmentId: 't-1',
    animalId: MILO,
    createdAt: AT,
    updatedAt: AT,
    ...fields,
  })
}

let sequence = 0

function line(fields: DoseFields): ExportTreatmentDose {
  sequence += 1
  const stamp = new Date(Date.parse(AT) + sequence * 1000).toISOString()
  return {
    id: `d-${sequence}`,
    treatmentId: 't-1',
    animalId: MILO,
    createdAt: stamp,
    updatedAt: stamp,
    ...BY_FIXTURE_DEVICE,
    ...fields,
  }
}

function given(dueOn: string, dueTime: string | null = null): ExportTreatmentDose {
  return line({
    periodId: 'p-1',
    dueOn,
    dueTime,
    givenOn: dueOn,
    status: 'given',
    nextDueDate: dueOn,
  })
}

function carnet(periods: ExportTreatmentPeriod[], doses: ExportTreatmentDose[]): ExportData {
  return {
    carnetSettings: null,
    animals: [
      animalOf({
        id: MILO,
        name: 'Milo',
        species: 'dog',
        breed: null,
        birthDate: null,
        photoFileName: null,
        createdAt: AT,
        updatedAt: AT,
      }),
    ],
    vaccinations: [],
    vaccinationInjections: [],
    treatments: [
      {
        id: 't-1',
        animalId: MILO,
        name: 'Métacam',
        type: 'medication',
        createdAt: AT,
        updatedAt: AT,
        ...BY_FIXTURE_DEVICE,
      },
    ],
    treatmentPeriods: periods,
    treatmentDoses: doses,
    weightEntries: [],
    devices: [],
  }
}

function treatmentRow(data: ExportData, today: string) {
  return buildCarnetPdfContent(data, MILO, today)!.treatments[0]!
}

function csvNextDueDate(data: ExportData, today: string): string {
  const csv = toCsvTables(data, 'kg', today)['traitements.csv']
  return csv.split('\r\n')[1]!.split(';').at(-1)!
}

/** Textes du PDF mis bout à bout : une cellule étroite passe à la ligne. */
function pdfText(data: ExportData, today: string): string {
  const content = buildCarnetPdfContent(data, MILO, today)!
  return readPdfPages(renderCarnetPdf(content, '0.1.24', null))
    .flatMap((page) => page.texts.map(({ text }) => text))
    .join(' ')
}

function created(change: LineChange): ExportTreatmentDose[] {
  return change.action === 'create' ? [line(change.dose)] : []
}

describe('PDF et CSV : prochaine échéance lue par le moteur', () => {
  it('donne l’heure de la prochaine dose quand la période a deux heures', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-10', frequency: DAILY, times: ['08:00', '20:00'] })],
      [
        given('2026-09-10', '08:00'),
        given('2026-09-10', '20:00'),
        given('2026-09-11', '08:00'),
        given('2026-09-11', '20:00'),
        given('2026-09-12', '08:00'),
      ],
    )

    expect(treatmentRow(data, '2026-09-12')).toMatchObject({
      due: { kind: 'due', dueOn: '2026-09-12', dueTime: '20:00', overdue: false },
      state: 'upToDate',
    })
    expect(pdfText(data, '2026-09-12')).toContain('12/09/2026\u00a0à\u00a020\u00a0h')
    expect(csvNextDueDate(data, '2026-09-12')).toBe('2026-09-12')
  })

  it('tait l’heure d’une période qui n’en a qu’une', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-10', frequency: DAILY, times: ['08:00'] })],
      [given('2026-09-10', '08:00')],
    )

    expect(treatmentRow(data, '2026-09-10').due).toEqual({
      kind: 'due',
      dueOn: '2026-09-11',
      dueTime: null,
      overdue: false,
    })
  })

  it('dit « En retard » à la date de la dose manquée', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-10', frequency: WEEKLY })],
      [given('2026-09-10')],
    )

    expect(treatmentRow(data, '2026-09-18')).toMatchObject({
      due: { kind: 'due', dueOn: '2026-09-17', overdue: true },
      state: 'overdue',
    })
    expect(csvNextDueDate(data, '2026-09-18')).toBe('2026-09-17')
  })

  it('dit « Terminé le » quand la date de fin est passée, sans échéance ni rappel', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-01', endsOn: '2026-09-03', frequency: DAILY })],
      [given('2026-09-01'), given('2026-09-02'), given('2026-09-03')],
    )

    expect(treatmentRow(data, '2026-09-10')).toMatchObject({
      due: { kind: 'ended', on: '2026-09-03' },
      state: 'none',
    })
    expect(pdfText(data, '2026-09-10')).toContain('Terminé le 03/09/2026')
    expect(pdfText(data, '2026-09-10')).toContain('Pas de rappel')
    expect(csvNextDueDate(data, '2026-09-10')).toBe('')
    expect(exportReminders(data, '2026-09-10')).toEqual([])
  })

  it('dit « Arrêté le » d’un traitement arrêté qui a des doses à renseigner, sans retard', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-01', stoppedOn: '2026-09-05', frequency: DAILY })],
      [given('2026-09-01')],
    )
    const schedule = treatmentSchedule({
      periods: data.treatmentPeriods,
      doses: data.treatmentDoses,
      today: '2026-09-10',
    })
    expect(schedule.unloggedDoses.length).toBeGreaterThan(0)

    expect(treatmentRow(data, '2026-09-10')).toMatchObject({
      due: { kind: 'stopped', on: '2026-09-05' },
      state: 'none',
    })
    expect(pdfText(data, '2026-09-10')).toContain('Arrêté le 05/09/2026')
    expect(csvNextDueDate(data, '2026-09-10')).toBe('')
    expect(exportReminders(data, '2026-09-10')).toEqual([])
  })

  it('suit un report et la ligne de décalage qui fait repartir la suite', () => {
    const first = given('2026-09-01')
    const base = carnet([period({ startsOn: '2026-09-01', frequency: WEEKLY })], [first])
    const moved = treatmentSchedule({
      periods: base.treatmentPeriods,
      doses: base.treatmentDoses,
      today: '2026-09-05',
    }).move({ periodId: 'p-1', dueOn: '2026-09-08', dueTime: null }, '2026-09-10')
    const doses = [first, ...created(moved.report), ...created(moved.shift)]
    expect(doses.map(({ status }) => status)).toEqual(['given', 'postponed', 'shift'])
    const data = carnet(base.treatmentPeriods, [...doses, given('2026-09-10')])

    expect(treatmentRow(data, '2026-09-12').due).toMatchObject({ kind: 'due', dueOn: '2026-09-17' })
    expect(csvNextDueDate(data, '2026-09-12')).toBe('2026-09-17')
    expect(exportReminders(data, '2026-09-12')).toMatchObject([{ dueDate: '2026-09-17' }])
  })

  it('n’échoue pas sur un traitement illisible : sa ligne le dit, sans échéance ni rappel', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-01', frequency: DAILY, times: ['25:00'] })],
      [given('2026-09-01')],
    )

    expect(treatmentRow(data, '2026-09-10')).toMatchObject({
      due: { kind: 'unreadable' },
      lastDoseDate: '2026-09-01',
      state: 'none',
    })
    expect(pdfText(data, '2026-09-10')).toContain('Donnée illisible')
    expect(pdfText(data, '2026-09-10')).toContain('Pas de rappel')
    expect(csvNextDueDate(data, '2026-09-10')).toBe('')
    expect(exportReminders(data, '2026-09-10')).toEqual([])
  })

  it('garde les lignes de données du JSON telles quelles', () => {
    const data = carnet(
      [period({ startsOn: '2026-09-01', frequency: DAILY, times: ['25:00'] })],
      [given('2026-09-01')],
    )
    const parsed = JSON.parse(
      toJsonExport(data, { exportedAt: new Date('2026-09-10T10:00:00'), appVersion: 'test' }),
    )

    expect(parsed.treatmentPeriods).toEqual(data.treatmentPeriods)
    expect(parsed.treatmentDoses).toEqual(data.treatmentDoses)
    expect(parsed.reminders).toEqual([])
  })
})
