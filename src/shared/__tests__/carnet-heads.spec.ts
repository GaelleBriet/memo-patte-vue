import { describe, expect, it } from 'vitest'

import {
  currentPeriods,
  givenDoseHistories,
  vaccinationHeads,
  vaccinationHistories,
} from '../domain/carnet-heads'
import type {
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccinationInjection,
} from '../domain/carnet-data'

const AT = '2026-01-01T00:00:00.000Z'

function injection(
  id: string,
  vaccinationId: string,
  injectedOn: string,
  createdAt = AT,
): ExportVaccinationInjection {
  return {
    id,
    vaccinationId,
    animalId: 'milo',
    injectedOn,
    nextDueDate: null,
    createdAt,
    updatedAt: createdAt,
    createdByDevice: 'appareil-test',
    updatedByDevice: 'appareil-test',
  }
}

function dose(
  id: string,
  dueOn: string,
  overrides: Partial<ExportTreatmentDose> = {},
): ExportTreatmentDose {
  return {
    id,
    periodId: 'bravecto',
    treatmentId: 'bravecto',
    animalId: 'milo',
    dueOn,
    dueTime: null,
    givenOn: dueOn,
    status: 'given',
    nextDueDate: '2027-01-01',
    createdAt: AT,
    updatedAt: AT,
    createdByDevice: 'appareil-test',
    updatedByDevice: 'appareil-test',
    ...overrides,
  }
}

function period(
  id: string,
  startsOn: string,
  overrides: Partial<ExportTreatmentPeriod> = {},
): ExportTreatmentPeriod {
  return {
    id,
    treatmentId: 'bravecto',
    animalId: 'milo',
    startsOn,
    firstDueOn: startsOn,
    referenceOn: startsOn,
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 3, unit: 'month' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    createdByDevice: 'appareil-test',
    updatedByDevice: 'appareil-test',
    ...overrides,
  }
}

describe('têtes du carnet', () => {
  it('retient pour chaque vaccin son injection la plus récente, jamais une ancienne saisie après', () => {
    const heads = vaccinationHeads([
      injection('rage-2025', 'rage', '2025-05-20'),
      injection('carre-2026', 'carre', '2026-03-01'),
      injection('rage-2019', 'rage', '2019-05-20', '2026-09-01T00:00:00.000Z'),
      injection('carre-2024', 'carre', '2024-03-01'),
    ])

    expect([...heads].map(([parent, head]) => [parent, head.id])).toEqual([
      ['rage', 'rage-2025'],
      ['carre', 'carre-2026'],
    ])
  })

  it('range l’historique de chaque vaccin du plus récent au plus ancien', () => {
    const histories = vaccinationHistories([
      injection('rage-2019', 'rage', '2019-05-20'),
      injection('rage-2025', 'rage', '2025-05-20'),
      injection('rage-2022', 'rage', '2022-05-20'),
    ])

    expect(histories.get('rage')?.map(({ id }) => id)).toEqual([
      'rage-2025',
      'rage-2022',
      'rage-2019',
    ])
  })

  it('range les prises données par leur date réelle, sans les oubliées ni les reportées', () => {
    const histories = givenDoseHistories([
      dose('a-l-heure', '2026-09-02'),
      dose('oubliee', '2026-09-03', { givenOn: null, status: 'missed' }),
      dose('reportee', '2026-09-04', { givenOn: null, status: 'postponed' }),
      dose('en-retard', '2026-09-01', { givenOn: '2026-09-05' }),
    ])

    expect(histories.get('bravecto')?.map(({ id }) => id)).toEqual(['en-retard', 'a-l-heure'])
  })

  it('retient pour chaque traitement sa période qui commence le plus tard, puis la dernière saisie', () => {
    const later = '2026-09-02T00:00:00.000Z'
    const periods = currentPeriods([
      period('reprise', '2026-06-01'),
      period('premiere', '2026-01-01', { createdAt: later }),
      period('meme-jour', '2026-06-01', { createdAt: later }),
      period('autre', '2025-01-01', { treatmentId: 'drontal' }),
    ])

    expect([...periods].map(([treatment, current]) => [treatment, current.id])).toEqual([
      ['bravecto', 'meme-jour'],
      ['drontal', 'autre'],
    ])
  })
})
