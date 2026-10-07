import { describe, expect, it } from 'vitest'

import { upgradeExport } from '../logic/export-upgrade'
import { derivedId } from '@/shared/utils/derived-id'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import exportV2 from './fixtures/export-v2-0.1.48.json?raw'
import exportV3 from './fixtures/export-v3-0.1.56.json?raw'

const DEVICE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const STAMPS = { createdByDevice: DEVICE, updatedByDevice: DEVICE }
const NO_LOSS = { injections: 0, doses: 0, weightEntries: 0 }

const MILO = 'f53143ec-dca0-430d-a77d-755f592ae425'
const LUNA = 'd50968dd-31a7-4782-b365-9c5285fe6c43'
const MILBEMAX = 'e4d428da-419e-4c67-a6f3-fcad10a2c6ff'
const RAGE = 'c926e5b4-b1c3-4773-bb3f-34e0acdb67da'
const ORPHAN = '99999999-9999-4999-8999-999999999999'
const ADVOCATE = '8fb41a2e-91e9-4844-8d11-a3dd2ed657b2'
const DRONTAL = '4fc4fafa-6af6-45af-9e48-7530b15f64c8'
const LUNA_V2 = '4d9d6901-b6a4-431c-b1f6-220d41055c7d'
const MILO_V2 = '28910fcd-d43c-47ba-aef4-b1d0cd458c0d'
const TREATMENT = '0b6f7f2e-3a8d-4f0e-9a1c-5d2b7e8f9a01'
const PERIOD = '7c1e9a3b-2d4f-4b6a-8e0c-1f3a5b7d9e2c'

type Row = Record<string, unknown>
type Document = Record<string, unknown>

function read(text: string): Document {
  return JSON.parse(text) as Document
}

function upgraded(document: Document) {
  const result = upgradeExport(document, DEVICE)
  if (result === null) throw new Error('conversion refusée')
  return { document: result.document as Record<string, Row[]>, lost: result.lost }
}

function rowsOf(document: Document, table: string): Row[] {
  return document[table] as Row[]
}

function byId(rows: Row[], id: unknown): Row | undefined {
  return rows.find((row) => row.id === id)
}

function doseId(index: number): string {
  return `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`
}

/** Export v2 réel, réduit à un traitement de Luna et à ses prises (date réelle, prochaine échéance annoncée). */
function v2With(
  frequency: { value: number; unit: string },
  doses: [string, string][],
  treatment: Row = {},
): Document {
  const document = read(exportV2)
  const at = '2026-09-20T08:00:00.000Z'
  document.treatments = [
    {
      id: TREATMENT,
      animalId: LUNA_V2,
      name: 'Stronghold',
      type: 'antiparasitic',
      frequency,
      stoppedOn: null,
      createdAt: at,
      updatedAt: at,
      ...treatment,
    },
  ]
  document.treatmentDoses = doses.map(([givenOn, nextDueDate], index) => ({
    id: doseId(index),
    treatmentId: TREATMENT,
    animalId: LUNA_V2,
    givenOn,
    nextDueDate,
    frequency,
    createdAt: `${givenOn}T08:00:00.000Z`,
    updatedAt: `${givenOn}T08:00:00.000Z`,
  }))
  return document
}

function treatmentLines(document: Record<string, Row[]>): Row[] {
  return document.treatmentDoses!.filter((dose) => dose.treatmentId === TREATMENT)
}

/** Export v3 réel, réduit à un hebdomadaire de Milo et à ses lignes. */
function v3With(doses: Row[]): Document {
  const document = read(exportV3)
  const at = '2026-10-01T08:00:00.000Z'
  const milo = rowsOf(document, 'animals').find((animal) => animal.name === 'Milo')!.id
  document.treatments = [
    {
      id: TREATMENT,
      animalId: milo,
      name: 'Stronghold',
      type: 'antiparasitic',
      createdAt: at,
      updatedAt: at,
    },
  ]
  document.treatmentPeriods = [
    {
      id: PERIOD,
      treatmentId: TREATMENT,
      animalId: milo,
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-02',
      endsOn: null,
      stoppedOn: null,
      frequency: { value: 1, unit: 'week' },
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
      createdAt: at,
      updatedAt: at,
    },
  ]
  document.treatmentDoses = doses.map((dose, index) => ({
    id: doseId(index),
    periodId: PERIOD,
    treatmentId: TREATMENT,
    animalId: milo,
    dueTime: null,
    givenOn: null,
    createdAt: at,
    updatedAt: at,
    ...dose,
  }))
  return document
}

describe('upgradeExport', () => {
  describe('format v1', () => {
    it('donne un fichier au format courant, sans rien perdre', () => {
      const { document, lost } = upgraded(read(exportV1))

      expect(document.schemaVersion).toBe(4)
      expect(document.carnetSettings).toBeNull()
      expect(document.devices).toEqual([])
      expect(lost).toEqual(NO_LOSS)
    })

    it('donne aux animaux les valeurs par défaut des champs ajoutés depuis', () => {
      const { document } = upgraded(read(exportV1))

      expect(byId(document.animals!, MILO)).toEqual({
        id: MILO,
        name: 'Milo',
        species: 'dog',
        breed: 'Berger australien',
        birthDate: '2021-04-12',
        birthDateApproximate: false,
        photoFileName: null,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
        createdAt: '2026-09-20T07:12:31.402Z',
        updatedAt: '2026-09-20T07:12:31.402Z',
        ...STAMPS,
      })
    })

    it('fait du poids à l’arrivée une pesée datée du jour de création de l’animal', () => {
      const { document } = upgraded(read(exportV1))

      expect(document.weightEntries).toHaveLength(4)
      expect(byId(document.weightEntries!, MILO)).toEqual({
        id: MILO,
        animalId: MILO,
        weightKg: 18.4,
        measuredOn: '2026-09-20',
        createdAt: '2026-09-20T07:12:31.402Z',
        updatedAt: '2026-09-20T07:12:31.402Z',
        ...STAMPS,
      })
      expect(byId(document.weightEntries!, LUNA)).toBeUndefined()
    })

    it('fait de la dernière injection d’un vaccin son unique injection', () => {
      const { document } = upgraded(read(exportV1))

      expect(byId(document.vaccinations!, RAGE)).toEqual({
        id: RAGE,
        animalId: MILO,
        name: 'Rage',
        plannedDueDate: null,
        createdAt: '2026-09-20T07:20:10.533Z',
        updatedAt: '2026-09-21T18:02:57.061Z',
        ...STAMPS,
      })
      expect(byId(document.vaccinationInjections!, RAGE)).toEqual({
        id: RAGE,
        vaccinationId: RAGE,
        animalId: MILO,
        injectedOn: '2026-09-21',
        nextDueDate: '2029-09-21',
        createdAt: '2026-09-20T07:20:10.533Z',
        updatedAt: '2026-09-21T18:02:57.061Z',
        ...STAMPS,
      })
    })

    it('reconstruit une période depuis la fréquence et la dernière prise, donnée ce jour-là', () => {
      const { document } = upgraded(read(exportV1))

      expect(byId(document.treatments!, MILBEMAX)).toEqual({
        id: MILBEMAX,
        animalId: MILO,
        name: 'Milbémax',
        type: 'deworming',
        createdAt: '2026-09-20T07:29:03.672Z',
        updatedAt: '2026-09-22T08:41:19.230Z',
        ...STAMPS,
      })
      expect(byId(document.treatmentPeriods!, MILBEMAX)).toEqual({
        id: MILBEMAX,
        treatmentId: MILBEMAX,
        animalId: MILO,
        startsOn: '2026-09-15',
        firstDueOn: '2026-09-15',
        referenceOn: '2026-09-15',
        endsOn: null,
        stoppedOn: null,
        frequency: { value: 3, unit: 'month' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
        createdAt: '2026-09-20T07:29:03.672Z',
        updatedAt: '2026-09-22T08:41:19.230Z',
        ...STAMPS,
      })
      expect(byId(document.treatmentDoses!, MILBEMAX)).toEqual({
        id: MILBEMAX,
        periodId: MILBEMAX,
        treatmentId: MILBEMAX,
        animalId: MILO,
        dueOn: '2026-09-15',
        dueTime: null,
        givenOn: '2026-09-15',
        status: 'given',
        nextDueDate: '2026-12-15',
        createdAt: '2026-09-20T07:29:03.672Z',
        updatedAt: '2026-09-22T08:41:19.230Z',
        ...STAMPS,
      })
    })

    it('garde l’arrêt d’un traitement', () => {
      const document = read(exportV1)
      byId(rowsOf(document, 'treatments'), MILBEMAX)!.stoppedOn = '2026-09-20'

      const period = byId(upgraded(document).document.treatmentPeriods!, MILBEMAX)

      expect(period).toMatchObject({ startsOn: '2026-09-15', stoppedOn: '2026-09-20' })
    })

    it('lit une date de naissance absente comme inconnue', () => {
      const document = read(exportV1)
      delete byId(rowsOf(document, 'animals'), MILO)!.birthDate

      expect(byId(upgraded(document).document.animals!, MILO)!.birthDate).toBeNull()
    })
  })

  describe('format v2', () => {
    it('donne un fichier au format courant, sans rien perdre', () => {
      const { document, lost } = upgraded(read(exportV2))

      expect(document.schemaVersion).toBe(4)
      expect(document.carnetSettings).toBeNull()
      expect(document.devices).toEqual([])
      expect(lost).toEqual(NO_LOSS)
      expect(document.vaccinationInjections).toHaveLength(5)
      expect(document.treatmentDoses).toHaveLength(19)
      expect(document.weightEntries).toHaveLength(10)
    })

    it('lit un export sans poids à l’arrivée, comme ceux de la 0.1.48', () => {
      const { document } = upgraded(read(exportV2))

      expect(byId(document.animals!, LUNA_V2)).toMatchObject({
        birthDateApproximate: false,
        ...STAMPS,
      })
      expect(byId(document.weightEntries!, LUNA_V2)).toBeUndefined()
    })

    it('garde chaque injection, sans le rappel prévu qu’il ne connaissait pas', () => {
      const v2 = read(exportV2)
      const { document } = upgraded(v2)

      expect(
        document.vaccinations!.every((vaccination) => vaccination.plannedDueDate === null),
      ).toBe(true)
      expect(document.vaccinationInjections).toEqual(
        rowsOf(v2, 'vaccinationInjections').map((injection) => ({ ...injection, ...STAMPS })),
      )
    })

    it('ouvre la période à la première prise, et chaque prise vise l’échéance que la précédente laissait', () => {
      const { document } = upgraded(read(exportV2))
      const drontal = document.treatmentDoses!.filter((dose) => dose.treatmentId === DRONTAL)

      expect(byId(document.treatmentPeriods!, DRONTAL)).toMatchObject({
        startsOn: '2025-07-10',
        firstDueOn: '2025-07-10',
        referenceOn: '2025-07-10',
        frequency: { value: 1, unit: 'month' },
        times: [],
      })
      expect(drontal).toHaveLength(15)
      expect(drontal.every((dose) => dose.status === 'given' && dose.dueOn === dose.givenOn)).toBe(
        true,
      )
      expect(byId(drontal, DRONTAL)).toEqual({
        id: DRONTAL,
        periodId: DRONTAL,
        treatmentId: DRONTAL,
        animalId: MILO_V2,
        dueOn: '2026-09-10',
        dueTime: null,
        givenOn: '2026-09-10',
        status: 'given',
        nextDueDate: '2026-10-10',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        ...STAMPS,
      })
    })

    it('garde l’arrêt d’un traitement arrêté', () => {
      const { document } = upgraded(read(exportV2))

      expect(byId(document.treatmentPeriods!, ADVOCATE)).toMatchObject({
        startsOn: '2026-05-10',
        stoppedOn: '2026-05-30',
        frequency: { value: 15, unit: 'day' },
      })
    })

    it('note une prise donnée en retard à son échéance, et ancre la suite à sa date réelle', () => {
      const { document } = upgraded(
        v2With({ value: 4, unit: 'week' }, [
          ['2026-08-04', '2026-09-01'],
          ['2026-09-03', '2026-10-01'],
        ]),
      )

      expect(treatmentLines(document)).toEqual([
        expect.objectContaining({
          id: doseId(0),
          dueOn: '2026-08-04',
          givenOn: '2026-08-04',
          status: 'given',
        }),
        expect.objectContaining({
          id: doseId(1),
          dueOn: '2026-09-01',
          givenOn: '2026-09-03',
          status: 'given',
          nextDueDate: '2026-10-01',
        }),
        {
          id: derivedId(doseId(1), 'shift'),
          periodId: TREATMENT,
          treatmentId: TREATMENT,
          animalId: LUNA_V2,
          dueOn: '2026-09-01',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-09-03',
          createdAt: '2026-09-03T08:00:00.000Z',
          updatedAt: '2026-09-03T08:00:00.000Z',
          ...STAMPS,
        },
      ])
    })

    it('ancre la suite sur la prochaine échéance annoncée quand elle ne part pas de la prise', () => {
      const { document } = upgraded(
        v2With({ value: 1, unit: 'week' }, [['2026-09-04', '2026-09-14']]),
      )

      expect(treatmentLines(document)).toEqual([
        expect.objectContaining({ dueOn: '2026-09-04', status: 'given' }),
        expect.objectContaining({
          dueOn: '2026-09-04',
          status: 'shift',
          nextDueDate: '2026-09-07',
        }),
      ])
    })

    it('ne compte pas la même échéance deux fois pour deux prises du même jour', () => {
      const { document, lost } = upgraded(
        v2With({ value: 1, unit: 'week' }, [
          ['2026-09-04', '2026-09-11'],
          ['2026-09-04', '2026-09-11'],
        ]),
      )

      expect(treatmentLines(document)).toHaveLength(1)
      expect(lost).toEqual({ ...NO_LOSS, doses: 1 })
    })

    it('ouvre la période d’un traitement sans prise au jour de sa création', () => {
      const { document } = upgraded(v2With({ value: 1, unit: 'week' }, []))

      expect(byId(document.treatmentPeriods!, TREATMENT)).toMatchObject({
        startsOn: '2026-09-20',
        firstDueOn: '2026-09-20',
      })
    })

    it('ouvre la période au jour de l’arrêt quand l’arrêt précède la première prise', () => {
      const { document } = upgraded(
        v2With({ value: 1, unit: 'week' }, [['2026-09-04', '2026-09-11']], {
          stoppedOn: '2026-09-01',
        }),
      )

      expect(byId(document.treatmentPeriods!, TREATMENT)).toMatchObject({
        startsOn: '2026-09-01',
        firstDueOn: '2026-09-04',
        stoppedOn: '2026-09-01',
      })
    })

    it('compte les prises et les injections dont le traitement ou le vaccin manque', () => {
      const document = read(exportV2)
      const [dose] = rowsOf(document, 'treatmentDoses')
      const [injection] = rowsOf(document, 'vaccinationInjections')
      rowsOf(document, 'treatmentDoses').push(
        { ...dose, id: doseId(1), treatmentId: ORPHAN },
        { ...dose, id: doseId(2), treatmentId: ORPHAN },
      )
      rowsOf(document, 'vaccinationInjections').push({
        ...injection,
        id: doseId(3),
        vaccinationId: ORPHAN,
      })

      const { document: converted, lost } = upgraded(document)

      expect(lost).toEqual({ injections: 1, doses: 2, weightEntries: 0 })
      expect(converted.treatmentDoses).toHaveLength(19)
      expect(converted.vaccinationInjections).toHaveLength(5)
    })

    it('fait du poids à l’arrivée une pesée du jour de création, quel que soit le fuseau', () => {
      const document = read(exportV2)
      const luna = byId(rowsOf(document, 'animals'), LUNA_V2)!
      Object.assign(luna, { initialWeightKg: 4.2, createdAt: '2026-09-20T23:30:00.000Z' })

      expect(byId(upgraded(document).document.weightEntries!, LUNA_V2)).toMatchObject({
        weightKg: 4.2,
        measuredOn: '2026-09-20',
      })
    })

    it.each([
      ['au-delà de 200 kg', 250],
      ['nul', 0],
      ['écrit en texte', '18,4'],
    ])('compte un poids à l’arrivée %s comme une pesée perdue', (_, weight) => {
      const document = read(exportV2)
      byId(rowsOf(document, 'animals'), LUNA_V2)!.initialWeightKg = weight

      const { document: converted, lost } = upgraded(document)

      expect(lost).toEqual({ ...NO_LOSS, weightEntries: 1 })
      expect(byId(converted.weightEntries!, LUNA_V2)).toBeUndefined()
    })
  })

  describe('format v3', () => {
    it('donne un fichier au format courant, sans rien perdre', () => {
      const { document, lost } = upgraded(read(exportV3))

      expect(document.schemaVersion).toBe(4)
      expect(document.devices).toEqual([])
      expect(lost).toEqual(NO_LOSS)
    })

    it('garde chaque ligne telle quelle et y ajoute l’appareil qui importe', () => {
      const v3 = read(exportV3)
      const { document } = upgraded(v3)

      for (const table of [
        'animals',
        'vaccinations',
        'vaccinationInjections',
        'treatments',
        'weightEntries',
      ]) {
        expect(document[table]).toEqual(rowsOf(v3, table).map((row) => ({ ...row, ...STAMPS })))
      }
      expect(document.treatmentDoses).toEqual(
        expect.arrayContaining(rowsOf(v3, 'treatmentDoses').map((row) => ({ ...row, ...STAMPS }))),
      )
      expect(document.carnetSettings).toEqual(
        v3.carnetSettings === null ? null : { ...(v3.carnetSettings as Row), ...STAMPS },
      )
    })

    it('fixe l’origine de la grille d’une période à sa première échéance', () => {
      const v3 = read(exportV3)

      expect(upgraded(v3).document.treatmentPeriods).toEqual(
        rowsOf(v3, 'treatmentPeriods').map((period) => ({
          ...period,
          referenceOn: period.firstDueOn,
          ...STAMPS,
        })),
      )
    })

    it('ajoute un décalage à un report, qui refaisait partir la suite de sa nouvelle date', () => {
      const { document } = upgraded(
        v3With([
          {
            dueOn: '2026-10-09',
            givenOn: '2026-10-09',
            status: 'given',
            nextDueDate: '2026-10-16',
          },
          { dueOn: '2026-10-16', status: 'postponed', nextDueDate: '2026-10-19' },
        ]),
      )

      expect(treatmentLines(document)).toEqual([
        expect.objectContaining({ id: doseId(0), status: 'given' }),
        expect.objectContaining({ id: doseId(1), status: 'postponed' }),
        expect.objectContaining({
          id: derivedId(doseId(1), 'shift'),
          periodId: PERIOD,
          dueOn: '2026-10-16',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-10-19',
        }),
      ])
    })

    it('ne garde que le report le plus récent d’une journée', () => {
      const { document } = upgraded(
        v3With([
          {
            dueOn: '2026-10-16',
            status: 'postponed',
            nextDueDate: '2026-10-18',
            updatedAt: '2026-10-15T08:00:00.000Z',
          },
          {
            dueOn: '2026-10-16',
            status: 'postponed',
            nextDueDate: '2026-10-19',
            updatedAt: '2026-10-15T09:00:00.000Z',
          },
        ]),
      )

      expect(treatmentLines(document).filter((dose) => dose.status === 'shift')).toEqual([
        expect.objectContaining({ id: derivedId(doseId(1), 'shift'), nextDueDate: '2026-10-19' }),
      ])
    })

    it('ajoute un décalage à une prise notée un autre jour quand la suite partait de sa date réelle', () => {
      const { document } = upgraded(
        v3With([
          {
            dueOn: '2026-10-09',
            givenOn: '2026-10-11',
            status: 'given',
            nextDueDate: '2026-10-18',
          },
          {
            dueOn: '2026-10-02',
            givenOn: '2026-10-03',
            status: 'given',
            nextDueDate: '2026-10-09',
          },
        ]),
      )

      expect(treatmentLines(document).filter((dose) => dose.status === 'shift')).toEqual([
        expect.objectContaining({
          id: derivedId(doseId(0), 'shift'),
          dueOn: '2026-10-09',
          nextDueDate: '2026-10-11',
        }),
      ])
    })

    it('garde un carnet aux réglages jamais touchés', () => {
      const document = read(exportV3)
      document.carnetSettings = null

      expect(upgraded(document).document.carnetSettings).toBeNull()
    })
  })

  describe('fichier hostile', () => {
    function longV3(periods: { first: string; frequency: Row; doses: Row[] }[]): Document {
      const document = v3With([])
      const milo = rowsOf(document, 'treatments')[0]!.animalId
      const [template] = rowsOf(document, 'treatmentPeriods')
      const id = (prefix: string, index: number) =>
        `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`
      document.treatments = periods.map((_, index) => ({
        ...rowsOf(document, 'treatments')[0],
        id: id('22222222', index),
      }))
      document.treatmentPeriods = periods.map(({ first, frequency }, index) => ({
        ...template,
        id: id('33333333', index),
        treatmentId: id('22222222', index),
        startsOn: first,
        firstDueOn: first,
        frequency,
      }))
      document.treatmentDoses = periods.flatMap(({ doses }, index) =>
        doses.map((dose, line) => ({
          id: `44444444-${String(index).padStart(4, '0')}-4000-8000-${String(line).padStart(12, '0')}`,
          periodId: id('33333333', index),
          treatmentId: id('22222222', index),
          animalId: milo,
          dueTime: null,
          givenOn: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          ...dose,
        })),
      )
      return document
    }

    function timed<T>(run: () => T): { result: T; seconds: number } {
      const start = performance.now()
      const result = run()
      return { result, seconds: (performance.now() - start) / 1000 }
    }

    const DAILY = { value: 1, unit: 'day' }

    it('refuse vite une période quotidienne de 1900 dont une ligne tombe en 2199', () => {
      const document = longV3([
        {
          first: '1900-01-01',
          frequency: DAILY,
          doses: [{ dueOn: '2199-12-30', status: 'missed', nextDueDate: '2199-12-31' }],
        },
      ])

      const { result, seconds } = timed(() => upgradeExport(document, DEVICE))

      expect(result).toBeNull()
      expect(seconds).toBeLessThan(1)
    })

    it('convertit vite deux cents périodes, et une période aux ancres extrêmes', () => {
      const many = longV3(
        Array.from({ length: 200 }, () => ({
          first: '2100-01-01',
          frequency: DAILY,
          doses: [
            {
              dueOn: '2100-12-30',
              givenOn: '2100-12-30',
              status: 'given',
              nextDueDate: '1900-01-01',
            },
          ],
        })),
      )
      const extreme = longV3([
        {
          first: '1900-01-31',
          frequency: { value: 365, unit: 'month' },
          doses: [
            {
              dueOn: '2199-12-31',
              givenOn: '1900-02-28',
              status: 'given',
              nextDueDate: '1900-01-01',
            },
            { dueOn: '1900-03-31', status: 'postponed', nextDueDate: '2199-12-29' },
          ],
        },
      ])

      const { result, seconds } = timed(() => [
        upgradeExport(many, DEVICE),
        upgradeExport(extreme, DEVICE),
      ])

      expect(result.every((converted) => converted !== null)).toBe(true)
      expect(seconds).toBeLessThan(1)
    })

    it.each([
      ['jusqu’à', '2162-11-21', false],
      ['au-delà de', '2162-11-22', true],
    ])(
      '%s 50 000 échéances estimées par période (dernière ligne le %s), refusé : %s',
      (_, dueOn, refused) => {
        const document = longV3([
          {
            first: '2026-01-01',
            frequency: DAILY,
            doses: [{ dueOn, status: 'missed', nextDueDate: dueOn }],
          },
        ])

        expect(upgradeExport(document, DEVICE) === null).toBe(refused)
      },
    )
  })

  describe('fichier illisible', () => {
    it.each([
      ['v1 sans animaux', 1, (document: Document) => delete document.animals],
      [
        'v1 à la date de prise impossible',
        1,
        (document: Document) => (rowsOf(document, 'treatments')[0]!.lastDoseDate = '2026-02-30'),
      ],
      [
        'v2 aux prises qui ne sont pas une liste',
        2,
        (document: Document) => (document.treatmentDoses = {}),
      ],
      [
        'v2 dont une ligne n’est pas un objet',
        2,
        (document: Document) => rowsOf(document, 'animals').push(null as never),
      ],
      ['v3 sans périodes', 3, (document: Document) => delete document.treatmentPeriods],
    ])('refuse un %s', (_, version, change) => {
      const document = read([exportV1, exportV2, exportV3][version - 1]!)
      change(document)

      expect(upgradeExport(document, DEVICE)).toBeNull()
    })

    it.each([0, 4, 5, '2'])('ne convertit pas une version %s', (schemaVersion) => {
      expect(upgradeExport({ ...read(exportV2), schemaVersion }, DEVICE)).toBeNull()
    })
  })
})
