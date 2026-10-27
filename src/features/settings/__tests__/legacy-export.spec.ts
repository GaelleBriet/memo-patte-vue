import { addDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { parseExportFile } from '../logic/parse-export-file'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import exportV2 from './fixtures/export-v2-0.1.48.json?raw'
import type { ExportData } from '@/shared/domain/carnet-data'
import { treatmentReading } from '@/shared/domain/treatment-reading'

const IMPORTEUR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TODAY = '2026-10-21'

type Document = Record<string, unknown>
type Row = Record<string, unknown>

function imported(text: string, today = TODAY): ExportData {
  const parsed = parseExportFile(text, IMPORTEUR, today)
  if (!parsed.ok) throw new Error(`export refusé : ${parsed.reason}`)
  return parsed.file.data
}

function reasonOf(text: string): string | null {
  const parsed = parseExportFile(text, IMPORTEUR, TODAY)
  return parsed.ok ? null : parsed.reason
}

function viewOf(data: ExportData, treatmentId: string, today = TODAY) {
  const periods = data.treatmentPeriods.filter((period) => period.treatmentId === treatmentId)
  const view = treatmentReading(
    { periods, doses: data.treatmentDoses.filter((dose) => dose.treatmentId === treatmentId) },
    today,
  )
  if (view === null) throw new Error('traitement illisible')
  return { view, firstDueOn: periods[0]!.firstDueOn }
}

/** La dose que l'app annonce : la première échéance sans prise, en retard comprise. */
function nextDose(data: ExportData, treatmentId: string, today = TODAY): string | null {
  const { view, firstDueOn } = viewOf(data, treatmentId, today)
  const [first] = view.upcoming({
    from: firstDueOn,
    to: format(addDays(parseISO(today), 800), 'yyyy-MM-dd'),
    limit: 1,
  })
  return first?.dueOn ?? null
}

function announced(text: string): Map<string, string> {
  const { reminders } = JSON.parse(text) as { reminders: Row[] }
  return new Map(
    reminders
      .filter(({ kind }) => kind === 'treatment')
      .map(({ sourceId, dueDate }) => [sourceId as string, dueDate as string]),
  )
}

function document(text: string): Document {
  return JSON.parse(text) as Document
}

function rows(file: Document, table: string): Row[] {
  return file[table] as Row[]
}

function edited(text: string, change: (file: Document) => void): string {
  const file = document(text)
  change(file)
  return JSON.stringify(file)
}

const localDay = (instant: string) => format(parseISO(instant), 'yyyy-MM-dd')

describe('export v1 (0.1.37) relu au format courant', () => {
  it('reprend les animaux, avec les champs ajoutés depuis à leur valeur par défaut', () => {
    const data = imported(exportV1)

    expect(data.animals.map(({ name }) => name)).toEqual(['Milo', 'Luna'])
    for (const animal of data.animals) {
      expect(animal).toMatchObject({
        birthDateApproximate: false,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
        createdByDevice: IMPORTEUR,
        updatedByDevice: IMPORTEUR,
      })
    }
    expect(data.carnetSettings).toBeNull()
    expect(data.devices).toEqual([])
  })

  it('fait du poids à l’arrivée une pesée du jour de création de l’animal', () => {
    const data = imported(exportV1)
    const milo = data.animals.find(({ name }) => name === 'Milo')!

    expect(data.weightEntries).toHaveLength(4)
    expect(data.weightEntries).toContainEqual(
      expect.objectContaining({
        id: milo.id,
        animalId: milo.id,
        weightKg: 18.4,
        measuredOn: localDay(milo.createdAt),
        createdAt: milo.createdAt,
      }),
    )
  })

  it('donne à chaque vaccin son injection, à l’identifiant du vaccin', () => {
    const data = imported(exportV1)
    const rage = data.vaccinations.find(({ name }) => name === 'Rage')!

    expect(data.vaccinations.every(({ plannedDueDate }) => plannedDueDate === null)).toBe(true)
    expect(data.vaccinationInjections).toHaveLength(3)
    expect(data.vaccinationInjections).toContainEqual(
      expect.objectContaining({
        id: rage.id,
        vaccinationId: rage.id,
        injectedOn: '2026-09-21',
        nextDueDate: '2029-09-21',
      }),
    )
  })

  it('donne à chaque traitement une période qui commence à sa dernière prise', () => {
    const data = imported(exportV1)
    const bravecto = data.treatments.find(({ name }) => name === 'Bravecto')!
    const [period] = data.treatmentPeriods.filter(({ treatmentId }) => treatmentId === bravecto.id)

    expect(data.treatmentPeriods).toHaveLength(3)
    expect(period).toMatchObject({
      id: bravecto.id,
      startsOn: '2026-07-31',
      firstDueOn: '2026-07-31',
      frequency: { value: 3, unit: 'month' },
      stoppedOn: null,
      times: [],
    })
    expect(data.treatmentDoses.filter(({ treatmentId }) => treatmentId === bravecto.id)).toEqual([
      expect.objectContaining({
        id: bravecto.id,
        periodId: bravecto.id,
        dueOn: '2026-07-31',
        givenOn: '2026-07-31',
        status: 'given',
      }),
    ])
  })

  it('annonce la prochaine dose que l’app de l’époque annonçait', () => {
    const data = imported(exportV1)

    for (const [treatmentId, dueDate] of announced(exportV1)) {
      expect(nextDose(data, treatmentId, '2026-09-23')).toBe(dueDate)
    }
  })
})

describe('export v2 (0.1.48) relu au format courant', () => {
  const DRONTAL = '4fc4fafa-6af6-45af-9e48-7530b15f64c8'
  const MILBEMAX = '835da0b3-250e-4d50-92c2-71c83bf49561'
  const ADVOCATE = '8fb41a2e-91e9-4844-8d11-a3dd2ed657b2'

  it('reprend toutes les lignes du fichier', () => {
    const data = imported(exportV2)
    const given = data.treatmentDoses.filter(({ status }) => status === 'given')

    expect(data.animals.map(({ name }) => name)).toEqual(['Luna', 'Milo'])
    expect(data.vaccinations).toHaveLength(3)
    expect(data.vaccinationInjections).toHaveLength(5)
    expect(data.treatments).toHaveLength(4)
    expect(data.treatmentPeriods).toHaveLength(4)
    expect(given.map(({ id }) => id).sort()).toEqual(
      rows(document(exportV2), 'treatmentDoses')
        .map(({ id }) => id as string)
        .sort(),
    )
    expect(data.weightEntries).toHaveLength(11)
  })

  it('garde la date réelle de chaque prise et l’arrêt d’un traitement', () => {
    const data = imported(exportV2)
    const advocate = data.treatmentPeriods.find(({ treatmentId }) => treatmentId === ADVOCATE)

    expect(advocate).toMatchObject({ startsOn: '2026-05-10', stoppedOn: '2026-05-30' })
    expect(
      data.treatmentDoses
        .filter(({ treatmentId, status }) => treatmentId === DRONTAL && status === 'given')
        .map(({ givenOn }) => givenOn)
        .sort(),
    ).toEqual(
      rows(document(exportV2), 'treatmentDoses')
        .filter(({ treatmentId }) => treatmentId === DRONTAL)
        .map(({ givenOn }) => givenOn)
        .sort(),
    )
  })

  it('reprend le rythme qu’une prise en retard ou en avance refixait', () => {
    const data = imported(exportV2)
    const shifts = data.treatmentDoses.filter(({ status }) => status === 'shift')

    expect(
      shifts.map(({ treatmentId, dueOn, targetOn }) => [treatmentId, dueOn, targetOn]),
    ).toEqual(
      expect.arrayContaining([
        [DRONTAL, '2026-07-10', '2026-07-13'],
        [MILBEMAX, '2026-09-04', '2026-08-30'],
      ]),
    )
    expect(shifts).toHaveLength(2)
  })

  it('annonce la prochaine dose que l’app de l’époque annonçait, sans dose à renseigner', () => {
    const data = imported(exportV2)

    for (const [treatmentId, dueDate] of announced(exportV2)) {
      expect(nextDose(data, treatmentId, '2026-09-30')).toBe(dueDate)
      expect(viewOf(data, treatmentId, '2026-09-30').view.unloggedDoses).toEqual([])
    }
    expect(viewOf(data, ADVOCATE).view.phase).toBe('stopped')
  })

  it('réimporté, garde les mêmes identifiants', () => {
    const ids = (data: ExportData) => data.treatmentDoses.map(({ id }) => id).sort()

    expect(ids(imported(exportV2))).toEqual(ids(imported(exportV2)))
  })
})

describe('anciennes prises rejouées', () => {
  const TREATMENT = '0b6f7f2e-3a8d-4f0e-9a1c-5d2b7e8f9a01'

  function v2With(
    frequency: { value: number; unit: 'day' | 'week' | 'month' },
    doses: [givenOn: string, nextDueDate: string][],
    doseFrequency = frequency,
  ): string {
    return edited(exportV2, (file) => {
      const luna = rows(file, 'animals')[0]!.id
      const at = '2026-01-02T08:00:00.000Z'
      file.treatments = [
        {
          id: TREATMENT,
          animalId: luna,
          name: 'Stronghold',
          type: 'antiparasitic',
          frequency,
          stoppedOn: null,
          createdAt: at,
          updatedAt: at,
        },
      ]
      file.treatmentDoses = doses.map(([givenOn, nextDueDate], index) => ({
        id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
        treatmentId: TREATMENT,
        animalId: luna,
        givenOn,
        nextDueDate,
        frequency: doseFrequency,
        createdAt: `${givenOn}T08:00:00.000Z`,
        updatedAt: `${givenOn}T08:00:00.000Z`,
      }))
    })
  }

  it('fait d’une seconde prise du même jour une prise en plus', () => {
    const data = imported(
      v2With({ value: 1, unit: 'week' }, [
        ['2026-09-01', '2026-09-08'],
        ['2026-09-01', '2026-09-08'],
      ]),
    )

    expect(data.treatmentDoses.map(({ status, dueOn }) => [status, dueOn])).toEqual(
      expect.arrayContaining([
        ['given', '2026-09-01'],
        ['extra', '2026-09-01'],
      ]),
    )
    expect(nextDose(data, TREATMENT, '2026-09-02')).toBe('2026-09-08')
  })

  it('reprend une prochaine dose choisie à la main', () => {
    const data = imported(v2With({ value: 4, unit: 'week' }, [['2026-09-01', '2026-10-15']]))

    expect(nextDose(data, TREATMENT, '2026-09-02')).toBe('2026-10-15')
  })

  it('suit les mois courts comme l’app de l’époque', () => {
    const data = imported(
      v2With({ value: 1, unit: 'month' }, [
        ['2026-01-31', '2026-02-28'],
        ['2026-02-28', '2026-03-28'],
      ]),
    )

    expect(nextDose(data, TREATMENT, '2026-03-01')).toBe('2026-03-28')
  })

  it('reprend la prochaine dose d’une prise notée avant un changement de fréquence', () => {
    const data = imported(
      v2With({ value: 1, unit: 'week' }, [['2026-09-01', '2026-10-01']], {
        value: 1,
        unit: 'month',
      }),
    )

    expect(data.treatmentPeriods[0]!.frequency).toEqual({ value: 1, unit: 'week' })
    expect(nextDose(data, TREATMENT, '2026-09-02')).toBe('2026-10-01')
  })

  it('rejoue des prises en retard, en avance et à l’heure', () => {
    const data = imported(
      v2With({ value: 10, unit: 'day' }, [
        ['2026-08-01', '2026-08-11'],
        ['2026-08-20', '2026-08-30'],
        ['2026-08-27', '2026-09-06'],
        ['2026-09-06', '2026-09-16'],
      ]),
    )

    expect(nextDose(data, TREATMENT, '2026-09-07')).toBe('2026-09-16')
    expect(viewOf(data, TREATMENT, '2026-09-07').view.unloggedDoses).toEqual([])
  })
})

describe('validation stricte d’un ancien export : tout ou rien', () => {
  it.each([
    ['v1', exportV1],
    ['v2', exportV2],
  ])('refuse un nom trop long dans un export %s', (_, text) => {
    const long = edited(text, (file) => (rows(file, 'animals')[0]!.name = 'a'.repeat(81)))

    expect(reasonOf(long)).toBe('nameTooLong')
  })

  it.each([
    ['un poids', 'weightEntries', 'weightKg'],
    ['un poids à l’arrivée', 'animals', 'initialWeightKg'],
  ])('refuse %s au-delà de 200 kg', (_, table, field) => {
    const heavy = edited(exportV1, (file) => (rows(file, table)[0]![field] = 250))

    expect(reasonOf(heavy)).toBe('outOfRange')
  })

  it.each<[string, (file: Document) => void]>([
    ['une prise d’un traitement absent du fichier', (file) => (file.treatments = [])],
    ['un vaccin sans injection', (file) => (file.vaccinationInjections = [])],
    ['un traitement sans prise', (file) => (file.treatmentDoses = [])],
    ['une ligne d’un animal absent', (file) => (file.animals = [rows(file, 'animals')[0]])],
    [
      'un identifiant en double',
      (file) => (rows(file, 'weightEntries')[1]!.id = rows(file, 'weightEntries')[0]!.id),
    ],
    ['une espèce inconnue', (file) => (rows(file, 'animals')[0]!.species = 'rabbit')],
    [
      'un type de traitement inconnu à l’époque',
      (file) => (rows(file, 'treatments')[0]!.type = 'medication'),
    ],
    ['une table absente', (file) => delete file.weightEntries],
  ])('refuse un export v2 avec %s', (_, change) => {
    expect(reasonOf(edited(exportV2, change))).toBe('invalid')
  })

  it('accepte une prise du lendemain de l’export, importée le jour de l’export (Paris, minuit passé)', () => {
    const file = edited(exportV2, (doc) => {
      doc.exportedAt = '2026-10-27T22:20:00.000Z'
      rows(doc, 'treatmentDoses')[0]!.givenOn = '2026-10-28'
    })

    expect(parseExportFile(file, IMPORTEUR, '2026-10-27').ok).toBe(true)
  })

  it('refuse sans exception un fichier forgé daté de 2199 de bout en bout', () => {
    const file = edited(exportV2, (doc) => {
      doc.exportedAt = '2199-06-01T00:00:00.000Z'
      rows(doc, 'treatmentDoses')[0]!.givenOn = '2199-06-01'
    })

    expect(reasonOf(file)).toBe('future')
  })

  it('refuse un export sans date d’export', () => {
    expect(reasonOf(edited(exportV2, (doc) => delete doc.exportedAt))).toBe('invalid')
  })

  it('refuse un export v2 avec une prise datée après son export, avec le motif des dates futures', () => {
    const file = edited(exportV2, (doc) => (rows(doc, 'treatmentDoses')[0]!.givenOn = '2199-01-01'))

    expect(reasonOf(file)).toBe('future')
  })

  it.each<[string, (file: Document) => void]>([
    [
      'un vaccin sans date d’injection',
      (file) => delete rows(file, 'vaccinations')[0]!.lastInjectionDate,
    ],
    [
      'un traitement sans prochaine dose',
      (file) => delete rows(file, 'treatments')[0]!.nextDueDate,
    ],
  ])('refuse un export v1 avec %s', (_, change) => {
    expect(reasonOf(edited(exportV1, change))).toBe('invalid')
  })
})
