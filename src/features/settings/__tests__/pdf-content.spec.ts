import { describe, expect, it } from 'vitest'

import { buildCarnetPdfContent, pdfExportFileName } from '../logic/pdf-content'
import { BY_FIXTURE_DEVICE, carnetOf, periodOf, type CarnetSummary } from './export-fixture'
import type {
  ExportAnimal,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
  ExportVaccinationInjection,
} from '@/shared/domain/carnet-data'

const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ANIMAL_ID = '22222222-2222-4222-8222-222222222222'

const SUMMARY: CarnetSummary = {
  animals: [
    {
      id: ANIMAL_ID,
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2020-05-01',
      photoFileName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
    {
      id: OTHER_ANIMAL_ID,
      name: 'Luna',
      species: 'cat',
      breed: null,
      birthDate: null,
      photoFileName: 'luna.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
  ],
  vaccinations: [
    {
      id: 'v-overdue',
      animalId: ANIMAL_ID,
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
      dueDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
    {
      id: 'v-none',
      animalId: ANIMAL_ID,
      name: 'Toux de chenil',
      lastInjectionDate: '2025-06-01',
      dueDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
    {
      id: 'v-other-animal',
      animalId: OTHER_ANIMAL_ID,
      name: 'Typhus',
      lastInjectionDate: '2026-01-01',
      dueDate: '2027-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
  ],
  treatments: [
    {
      id: 't-upcoming',
      animalId: ANIMAL_ID,
      name: 'Milbémax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-01',
      nextDueDate: '2026-09-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
  ],
  weightEntries: [
    {
      id: 'w-2',
      animalId: ANIMAL_ID,
      weightKg: 26,
      measuredOn: '2026-06-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
    {
      id: 'w-1',
      animalId: ANIMAL_ID,
      weightKg: 25,
      measuredOn: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    },
  ],
}

const DATA = carnetOf(SUMMARY)
const TODAY = '2026-07-01'

describe('buildCarnetPdfContent', () => {
  it('renvoie null pour un animal inconnu', () => {
    expect(buildCarnetPdfContent(DATA, 'introuvable', TODAY)).toBeNull()
  })

  it("ne retient que les lignes de l'animal demandé", () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.animal).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2020-05-01',
      birthDateApproximate: false,
      departureDate: null,
      photoFileName: null,
    })
    expect(content.vaccinations.map((row) => row.name)).toEqual(['Rage', 'Toux de chenil'])
    expect(content.treatments).toHaveLength(1)
    expect(content.weightEntries).toHaveLength(2)
  })

  it('garde un traitement dont la première prise est à venir, sans dernière prise', () => {
    const data = {
      ...DATA,
      treatmentPeriods: DATA.treatmentPeriods.map((period) => ({
        ...period,
        startsOn: '2026-07-10',
        firstDueOn: '2026-07-10',
        referenceOn: '2026-07-10',
      })),
      treatmentDoses: [],
    }

    expect(buildCarnetPdfContent(data, ANIMAL_ID, TODAY)?.treatments).toEqual([
      {
        name: 'Milbémax',
        lastDoseDate: null,
        lastDoseExtra: false,
        periods: [
          {
            from: '2026-07-10',
            to: null,
            frequency: { value: 3, unit: 'month' },
            times: [],
            dosage: { doseQuantity: null, doseUnit: null },
            lines: [],
          },
        ],
        due: { kind: 'due', dueOn: '2026-07-10', dueTime: null, overdue: false },
        state: 'upToDate',
      },
    ])
  })

  it('garde un traitement qui n’a que des doses oubliées, avec sa prochaine dose', () => {
    const [dose] = DATA.treatmentDoses
    const data = {
      ...DATA,
      treatmentDoses: [{ ...dose!, givenOn: null, status: 'missed' as const }],
    }

    const [row] = buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!.treatments

    expect(row).toMatchObject({
      name: 'Milbémax',
      lastDoseDate: null,
      due: { kind: 'due', dueOn: '2026-09-01', overdue: false },
    })
  })

  it('classe chaque échéance en retard, à jour ou sans rappel', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    const rage = content.vaccinations.find((row) => row.name === 'Rage')!
    const kennel = content.vaccinations.find((row) => row.name === 'Toux de chenil')!
    expect(rage.state).toBe('overdue')
    expect(kennel.state).toBe('none')
    expect(content.treatments[0]!.state).toBe('upToDate')
  })

  it('montre un traitement arrêté avec sa date d’arrêt, sans échéance ni rappel, après les autres', () => {
    const data = carnetOf({
      ...SUMMARY,
      treatments: [
        { ...SUMMARY.treatments[0]!, id: 't-stopped', name: 'Drontal', stoppedOn: '2026-06-20' },
        ...SUMMARY.treatments,
      ],
    })

    const content = buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!

    expect(content.treatments.map((row) => [row.name, row.due, row.state])).toEqual([
      ['Milbémax', { kind: 'due', dueOn: '2026-09-01', dueTime: null, overdue: false }, 'upToDate'],
      ['Drontal', { kind: 'stopped', on: '2026-06-20' }, 'none'],
    ])
  })

  it('trie les échéances par date, les rappels absents en dernier', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.vaccinations.map((row) => row.name)).toEqual(['Rage', 'Toux de chenil'])
  })

  it('trie les pesées par date de mesure', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.weightEntries.map((row) => row.measuredOn)).toEqual(['2026-01-01', '2026-06-01'])
  })

  it('reprend le nom de fichier de la photo quand il existe', () => {
    expect(buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!.animal.photoFileName).toBeNull()
    expect(buildCarnetPdfContent(DATA, OTHER_ANIMAL_ID, TODAY)!.animal.photoFileName).toBe(
      'luna.jpg',
    )
  })
})

describe('buildCarnetPdfContent — identité', () => {
  function animalWith(fields: Partial<ExportAnimal>) {
    const data = {
      ...DATA,
      animals: DATA.animals.map((item) => (item.id === ANIMAL_ID ? { ...item, ...fields } : item)),
    }
    return buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!.animal
  }

  it('dit si la date de naissance est approximative', () => {
    expect(animalWith({ birthDateApproximate: true })).toMatchObject({
      birthDate: '2020-05-01',
      birthDateApproximate: true,
    })
  })

  it('donne la date du départ d’un animal qu’on ne suit plus, jamais le motif', () => {
    const animal = animalWith({
      unfollowedOn: '2026-06-30',
      departureReason: 'death',
      departureDate: '2026-06-28',
    })

    expect(animal.departureDate).toBe('2026-06-28')
    expect(JSON.stringify(animal)).not.toContain('death')
  })

  it('ne donne aucune date de départ sans date renseignée, ni pour un animal suivi', () => {
    expect(animalWith({ unfollowedOn: '2026-06-30', departureReason: 'other' }).departureDate).toBe(
      null,
    )
    expect(animalWith({ unfollowedOn: null, departureDate: '2026-06-28' }).departureDate).toBe(null)
  })
})

describe('buildCarnetPdfContent — vaccin prévu', () => {
  function plannedRow(plannedDueDate: string | null) {
    const data = {
      ...DATA,
      vaccinations: [
        ...DATA.vaccinations,
        { ...DATA.vaccinations[0]!, id: 'v-prevu', name: 'CHPPiL', plannedDueDate },
      ],
    }
    return buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!.vaccinations.find(
      (row) => row.name === 'CHPPiL',
    )
  }

  it('garde un vaccin jamais fait, « Prévu » jusqu’au jour du rendez-vous compris', () => {
    expect(plannedRow('2026-07-15')).toEqual({
      name: 'CHPPiL',
      lastInjectionDate: null,
      injectionDates: [],
      dueDate: '2026-07-15',
      state: 'planned',
    })
    expect(plannedRow(TODAY)?.state).toBe('planned')
  })

  it('le passe en retard le lendemain du rendez-vous, sans rappel sans date', () => {
    expect(plannedRow('2026-06-30')?.state).toBe('overdue')
    expect(plannedRow(null)?.state).toBe('none')
  })

  it('ne marque jamais « Prévu » un vaccin déjà injecté', () => {
    const states = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!.vaccinations.map(
      ({ state }) => state,
    )

    expect(states).not.toContain('planned')
  })
})

describe('buildCarnetPdfContent — historique', () => {
  const AT = '2026-01-01T00:00:00.000Z'
  const STAMPS = { createdAt: AT, updatedAt: AT, ...BY_FIXTURE_DEVICE }
  const MONTHLY = { value: 1, unit: 'month' } as const

  function injection(injectedOn: string): ExportVaccinationInjection {
    return {
      id: `i-${injectedOn}`,
      vaccinationId: 'v-overdue',
      animalId: ANIMAL_ID,
      injectedOn,
      nextDueDate: null,
      ...STAMPS,
    }
  }

  type PeriodSpec = Pick<ExportTreatmentPeriod, 'id' | 'startsOn'> & Partial<ExportTreatmentPeriod>

  type DoseSpec = Pick<ExportTreatmentDose, 'periodId' | 'dueOn' | 'status'> &
    Partial<ExportTreatmentDose>

  function doseOf(spec: DoseSpec, index: number): ExportTreatmentDose {
    return {
      id: `d-${index}`,
      treatmentId: 't-upcoming',
      animalId: ANIMAL_ID,
      dueTime: null,
      givenOn: spec.status === 'given' || spec.status === 'extra' ? spec.dueOn : null,
      nextDueDate: '2099-01-01',
      ...STAMPS,
      ...spec,
    }
  }

  function treatmentRow(periods: PeriodSpec[], doses: DoseSpec[], today = TODAY) {
    const data = {
      ...DATA,
      treatmentPeriods: periods.map((period) =>
        periodOf({ treatmentId: 't-upcoming', animalId: ANIMAL_ID, ...STAMPS, ...period }),
      ),
      treatmentDoses: doses.map(doseOf),
    }
    return buildCarnetPdfContent(data, ANIMAL_ID, today)!.treatments[0]!
  }

  function given(periodId: string, ...days: string[]): DoseSpec[] {
    return days.map((dueOn) => ({ periodId, dueOn, status: 'given' }))
  }

  function at(on: string, time: string | null = null, extra = false) {
    return { on, time, extra }
  }

  it('liste toutes les injections d’un vaccin, la plus récente d’abord, jamais regroupées', () => {
    const years = ['2021-01-01', '2025-01-01', '2022-01-01', '2024-01-01', '2023-01-01']
    const data = {
      ...DATA,
      vaccinationInjections: [
        ...DATA.vaccinationInjections.filter(({ vaccinationId }) => vaccinationId !== 'v-overdue'),
        ...years.map(injection),
      ],
    }

    const rage = buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!.vaccinations.find(
      (row) => row.name === 'Rage',
    )!

    expect(rage.injectionDates).toEqual([...years].sort().reverse())
  })

  it('date la dernière prise de sa date réelle', () => {
    const row = treatmentRow(
      [{ id: 'p', startsOn: '2026-04-01' }],
      [
        { periodId: 'p', dueOn: '2026-04-01', status: 'given' },
        { periodId: 'p', dueOn: '2026-05-01', status: 'given', givenOn: '2026-05-20' },
        { periodId: 'p', dueOn: '2026-06-01', status: 'missed' },
      ],
    )

    expect(row.lastDoseDate).toBe('2026-05-20')
    expect(row.lastDoseExtra).toBe(false)
  })

  it('compte une prise en plus comme une dose donnée, marquée, à sa date réelle', () => {
    const row = treatmentRow(
      [{ id: 'p', startsOn: '2026-04-01' }],
      [
        ...given('p', '2026-04-01', '2026-05-01'),
        { periodId: 'p', dueOn: '2026-05-08', status: 'extra' },
      ],
    )

    expect(row.lastDoseDate).toBe('2026-05-08')
    expect(row.lastDoseExtra).toBe(true)
    expect(row.periods[0]!.lines[1]).toEqual({
      kind: 'given',
      series: {
        kind: 'dates',
        doses: [at('2026-05-08', null, true), at('2026-05-01'), at('2026-04-01')],
      },
    })
  })

  it('traitement à deux heures : prises et oublis à leur heure, doses non renseignées à leur place', () => {
    const times = ['08:00', '20:00']
    const twice = (dueOn: string, status: 'given' | 'missed' = 'given'): DoseSpec[] =>
      times.map((dueTime) => ({ periodId: 'p', dueOn, dueTime, status }))
    const row = treatmentRow(
      [
        {
          id: 'p',
          startsOn: '2026-06-01',
          endsOn: '2026-06-10',
          frequency: { value: 1, unit: 'day' },
          times,
          doseQuantity: 0.5,
          doseUnit: 'tablet',
        },
      ],
      [
        ...twice('2026-06-01'),
        { periodId: 'p', dueOn: '2026-06-02', dueTime: '08:00', status: 'given' },
        { periodId: 'p', dueOn: '2026-06-02', dueTime: '20:00', status: 'missed' },
        ...['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10'].flatMap((day) =>
          twice(day),
        ),
      ],
    )

    expect(row.periods).toEqual([
      {
        from: '2026-06-01',
        to: '2026-06-10',
        frequency: { value: 1, unit: 'day' },
        times,
        dosage: { doseQuantity: 0.5, doseUnit: 'tablet' },
        lines: [
          {
            kind: 'given',
            series: { kind: 'range', count: 10, from: '2026-06-06', to: '2026-06-10' },
          },
          { kind: 'unlogged', from: '2026-06-03', to: '2026-06-05' },
          { kind: 'missed', series: { kind: 'dates', doses: [at('2026-06-02', '20:00')] } },
          {
            kind: 'given',
            series: {
              kind: 'dates',
              doses: [
                at('2026-06-02', '08:00'),
                at('2026-06-01', '20:00'),
                at('2026-06-01', '08:00'),
              ],
            },
          },
        ],
      },
    ])
  })

  it('range chaque période, la plus récente d’abord, avec ses réglages, ses oublis regroupés et ses reports', () => {
    const row = treatmentRow(
      [
        {
          id: 'p0',
          startsOn: '2025-11-01',
          frequency: { value: 2, unit: 'week' },
          doseQuantity: 2,
          doseUnit: 'tablet',
        },
        {
          id: 'p1',
          startsOn: '2026-01-01',
          frequency: MONTHLY,
          doseQuantity: 1,
          doseUnit: 'tablet',
        },
      ],
      [
        ...given('p0', '2025-11-01', '2025-11-15'),
        ...given('p1', '2026-01-01'),
        ...['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((dueOn): DoseSpec => ({
          periodId: 'p1',
          dueOn,
          status: 'missed',
        })),
        { periodId: 'p1', dueOn: '2026-06-01', status: 'postponed', nextDueDate: '2026-06-04' },
        ...given('p1', '2026-06-04'),
      ],
      '2026-06-20',
    )

    expect(row.periods).toEqual([
      {
        from: '2026-01-01',
        to: null,
        frequency: MONTHLY,
        times: [],
        dosage: { doseQuantity: 1, doseUnit: 'tablet' },
        lines: [
          { kind: 'given', series: { kind: 'dates', doses: [at('2026-06-04')] } },
          { kind: 'moved', dueOn: '2026-06-01', to: '2026-06-04', advanced: false },
          {
            kind: 'missed',
            series: { kind: 'range', count: 4, from: '2026-02-01', to: '2026-05-01' },
          },
          { kind: 'given', series: { kind: 'dates', doses: [at('2026-01-01')] } },
        ],
      },
      {
        from: '2025-11-01',
        to: '2025-12-31',
        frequency: { value: 2, unit: 'week' },
        times: [],
        dosage: { doseQuantity: 2, doseUnit: 'tablet' },
        lines: [
          { kind: 'unlogged', from: '2025-11-29', to: '2025-12-27' },
          { kind: 'given', series: { kind: 'dates', doses: [at('2025-11-15'), at('2025-11-01')] } },
        ],
      },
    ])
  })

  it('distingue une dose avancée d’une dose reportée', () => {
    const row = treatmentRow(
      [{ id: 'p', startsOn: '2026-04-01' }],
      [
        ...given('p', '2026-04-01', '2026-05-01'),
        { periodId: 'p', dueOn: '2026-06-01', status: 'postponed', nextDueDate: '2026-05-28' },
        ...given('p', '2026-05-28'),
      ],
    )

    expect(row.periods[0]!.lines).toContainEqual({
      kind: 'moved',
      dueOn: '2026-06-01',
      to: '2026-05-28',
      advanced: true,
    })
  })

  it('n’écrit pas les heures d’une période qui n’en a qu’une', () => {
    const row = treatmentRow(
      [{ id: 'p', startsOn: '2026-06-01', times: ['20:00'] }],
      [{ periodId: 'p', dueOn: '2026-06-01', dueTime: '20:00', status: 'given' }],
    )

    expect(row.periods[0]).toMatchObject({
      times: [],
      lines: [{ kind: 'given', series: { kind: 'dates', doses: [at('2026-06-01')] } }],
    })
  })

  it('liste jusqu’à trois prises qui se suivent, les résume au-delà', () => {
    const days = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']

    expect(
      treatmentRow([{ id: 'p', startsOn: '2026-04-01' }], given('p', ...days.slice(2))).periods[0]!
        .lines,
    ).toEqual([
      {
        kind: 'given',
        series: { kind: 'dates', doses: [at('2026-06-01'), at('2026-05-01'), at('2026-04-01')] },
      },
    ])
    expect(
      treatmentRow([{ id: 'p', startsOn: '2026-02-01' }], given('p', ...days)).periods[0]!.lines,
    ).toEqual([
      { kind: 'given', series: { kind: 'range', count: 5, from: '2026-02-01', to: '2026-06-01' } },
    ])
  })

  it('ignore les lignes de décalage des doses suivantes', () => {
    const row = treatmentRow(
      [{ id: 'p', startsOn: '2026-05-01' }],
      [
        ...given('p', '2026-05-01'),
        { periodId: 'p', dueOn: '2026-06-01', status: 'given', givenOn: '2026-06-05' },
        { periodId: 'p', dueOn: '2026-06-01', status: 'shift', nextDueDate: '2026-06-05' },
      ],
    )

    expect(row.periods[0]!.lines.map(({ kind }) => kind)).toEqual(['given'])
  })

  describe('traitement illisible', () => {
    const UNREADABLE = { id: 'p', startsOn: '2026-01-01', times: ['25:00'] }

    it('garde « Donnée illisible » et son historique tel qu’enregistré, sans doses non renseignées', () => {
      const row = treatmentRow(
        [UNREADABLE],
        [
          ...given('p', '2026-01-01', '2026-02-01'),
          { periodId: 'p', dueOn: '2026-03-01', status: 'missed' },
          ...given('p', '2026-06-01'),
        ],
      )

      expect(row.due).toEqual({ kind: 'unreadable' })
      expect(row.periods[0]!.lines).toEqual([
        { kind: 'given', series: { kind: 'dates', doses: [at('2026-06-01')] } },
        { kind: 'missed', series: { kind: 'dates', doses: [at('2026-03-01')] } },
        { kind: 'given', series: { kind: 'dates', doses: [at('2026-02-01'), at('2026-01-01')] } },
      ])
    })

    it('commence une nouvelle série quand l’écart dépasse 1,5 fois la fréquence', () => {
      const row = treatmentRow([UNREADABLE], given('p', '2026-01-01', '2026-02-01', '2026-06-01'))

      expect(row.periods[0]!.lines).toEqual([
        { kind: 'given', series: { kind: 'dates', doses: [at('2026-06-01')] } },
        { kind: 'given', series: { kind: 'dates', doses: [at('2026-02-01'), at('2026-01-01')] } },
      ])
    })
  })
})

describe('pdfExportFileName', () => {
  const AT = new Date('2026-09-23T14:32:00')

  it("compose le nom à partir du mot « carnet », du nom de l'animal et de la minute locale", () => {
    expect(pdfExportFileName('carnet', ['Milo'], AT)).toBe('carnet-milo-20260923-1432.pdf')
    expect(pdfExportFileName('carnet', ['Milo'], new Date('2026-09-23T09:05:00'))).toBe(
      'carnet-milo-20260923-0905.pdf',
    )
  })

  it('retire les accents, remplace tout autre caractère par un tiret, sans tiret doublé ni en bord', () => {
    expect(pdfExportFileName('carnet', ["  Néo l'énergique !! "], AT)).toBe(
      'carnet-neo-l-energique-20260923-1432.pdf',
    )
  })

  it('se passe du nom quand il ne donne aucun caractère', () => {
    expect(pdfExportFileName('carnet', ['🐶'], AT)).toBe('carnet-20260923-1432.pdf')
  })

  it('nomme « memopatte » le PDF de plusieurs animaux, sans leurs noms', () => {
    expect(pdfExportFileName('carnet', ['Milo', 'Luna'], AT)).toBe(
      'carnet-memopatte-20260923-1432.pdf',
    )
  })

  it('simplifie aussi le mot traduit', () => {
    expect(pdfExportFileName('Health record', ['Milo'], AT)).toBe(
      'health-record-milo-20260923-1432.pdf',
    )
  })
})
