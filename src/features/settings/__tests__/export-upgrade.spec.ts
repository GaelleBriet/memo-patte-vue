import { describe, expect, it } from 'vitest'

import { upgradeExport } from '../logic/export-upgrade'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import exportV2 from './fixtures/export-v2-0.1.45.json?raw'
import exportV3 from './fixtures/export-v3-0.1.52.json?raw'

const DEVICE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const STAMPS = { createdByDevice: DEVICE, updatedByDevice: DEVICE }
const NO_LOSS = { injections: 0, doses: 0, weightEntries: 0 }

const MILO = 'f53143ec-dca0-430d-a77d-755f592ae425'
const LUNA = 'd50968dd-31a7-4782-b365-9c5285fe6c43'
const STRONGHOLD = '626a7787-96ce-479e-8b2e-09edb1319378'
const MILBEMAX = 'e4d428da-419e-4c67-a6f3-fcad10a2c6ff'
const RAGE = 'c926e5b4-b1c3-4773-bb3f-34e0acdb67da'
const ORPHAN = '99999999-9999-4999-8999-999999999999'

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
      expect(document.vaccinationInjections).toHaveLength(3)
      expect(document.treatmentDoses).toHaveLength(4)
      expect(document.weightEntries).toHaveLength(3)
    })

    it('garde chaque injection, sans le rappel prévu qu’il ne connaissait pas', () => {
      const { document } = upgraded(read(exportV2))

      expect(byId(document.vaccinations!, RAGE)).toMatchObject({ plannedDueDate: null, ...STAMPS })
      expect(
        document.vaccinationInjections!.filter((injection) => injection.vaccinationId === RAGE),
      ).toEqual([
        expect.objectContaining({ injectedOn: '2026-09-21', nextDueDate: '2029-09-21', ...STAMPS }),
        expect.objectContaining({ injectedOn: '2023-09-18', nextDueDate: '2026-09-18', ...STAMPS }),
      ])
    })

    it('ouvre la période d’un traitement à sa première prise, et rattache toutes ses prises', () => {
      const { document } = upgraded(read(exportV2))

      expect(byId(document.treatmentPeriods!, STRONGHOLD)).toMatchObject({
        treatmentId: STRONGHOLD,
        animalId: LUNA,
        startsOn: '2026-08-04',
        firstDueOn: '2026-08-04',
        referenceOn: '2026-08-04',
        stoppedOn: null,
        frequency: { value: 4, unit: 'week' },
        times: [],
      })
      expect(document.treatmentDoses!.filter((dose) => dose.treatmentId === STRONGHOLD)).toEqual([
        {
          id: STRONGHOLD,
          periodId: STRONGHOLD,
          treatmentId: STRONGHOLD,
          animalId: LUNA,
          dueOn: '2026-08-04',
          dueTime: null,
          givenOn: '2026-08-04',
          status: 'given',
          nextDueDate: '2026-09-01',
          createdAt: '2026-09-20T07:31:48.015Z',
          updatedAt: '2026-09-20T07:31:48.015Z',
          ...STAMPS,
        },
        expect.objectContaining({ dueOn: '2026-09-03', givenOn: '2026-09-03', status: 'given' }),
      ])
    })

    it('garde l’arrêt d’un traitement arrêté', () => {
      const { document } = upgraded(read(exportV2))

      expect(byId(document.treatmentPeriods!, MILBEMAX)).toMatchObject({
        startsOn: '2026-06-15',
        stoppedOn: '2026-09-25',
        frequency: { value: 3, unit: 'month' },
      })
    })

    it('ouvre la période au jour de l’arrêt quand l’arrêt précède la première prise', () => {
      const document = read(exportV2)
      byId(rowsOf(document, 'treatments'), MILBEMAX)!.stoppedOn = '2026-06-01'

      const period = byId(upgraded(document).document.treatmentPeriods!, MILBEMAX)

      expect(period).toMatchObject({
        startsOn: '2026-06-01',
        firstDueOn: '2026-06-01',
        stoppedOn: '2026-06-01',
      })
    })

    it('ouvre la période d’un traitement sans prise au jour de sa création', () => {
      const document = read(exportV2)
      document.treatmentDoses = rowsOf(document, 'treatmentDoses').filter(
        (dose) => dose.treatmentId !== STRONGHOLD,
      )

      const period = byId(upgraded(document).document.treatmentPeriods!, STRONGHOLD)

      expect(period).toMatchObject({ startsOn: '2026-09-20', firstDueOn: '2026-09-20' })
    })

    it('compte les prises et les injections dont le traitement ou le vaccin manque', () => {
      const document = read(exportV2)
      const [dose] = rowsOf(document, 'treatmentDoses')
      const [injection] = rowsOf(document, 'vaccinationInjections')
      rowsOf(document, 'treatmentDoses').push(
        { ...dose, id: '11111111-0000-4000-8000-000000000001', treatmentId: ORPHAN },
        { ...dose, id: '11111111-0000-4000-8000-000000000002', treatmentId: ORPHAN },
      )
      rowsOf(document, 'vaccinationInjections').push({
        ...injection,
        id: '11111111-0000-4000-8000-000000000003',
        vaccinationId: ORPHAN,
      })

      const { document: converted, lost } = upgraded(document)

      expect(lost).toEqual({ injections: 1, doses: 2, weightEntries: 0 })
      expect(converted.treatmentDoses).toHaveLength(4)
      expect(converted.vaccinationInjections).toHaveLength(3)
    })

    it.each([
      ['au-delà de 200 kg', 250],
      ['nul', 0],
      ['écrit en texte', '18,4'],
    ])('compte un poids à l’arrivée %s comme une pesée perdue', (_, weight) => {
      const document = read(exportV2)
      byId(rowsOf(document, 'animals'), MILO)!.initialWeightKg = weight

      const { document: converted, lost } = upgraded(document)

      expect(lost).toEqual({ ...NO_LOSS, weightEntries: 1 })
      expect(byId(converted.weightEntries!, MILO)).toBeUndefined()
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
        'treatmentDoses',
        'weightEntries',
      ]) {
        expect(document[table]).toEqual(rowsOf(v3, table).map((row) => ({ ...row, ...STAMPS })))
      }
      expect(document.carnetSettings).toEqual({ ...(v3.carnetSettings as Row), ...STAMPS })
    })

    it('fixe l’origine de la grille d’une période à sa première échéance', () => {
      const v3 = read(exportV3)
      const [period] = rowsOf(v3, 'treatmentPeriods')

      expect(upgraded(v3).document.treatmentPeriods).toEqual([
        { ...period, referenceOn: '2026-09-28', ...STAMPS },
      ])
    })

    it('garde un carnet aux réglages jamais touchés', () => {
      const document = read(exportV3)
      document.carnetSettings = null

      expect(upgraded(document).document.carnetSettings).toBeNull()
    })
  })

  describe('fichier illisible', () => {
    it.each([
      ['v1 sans animaux', 1, (document: Document) => delete document.animals],
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
      const text = [exportV1, exportV2, exportV3][version - 1]!
      const document = read(text)
      change(document)

      expect(upgradeExport(document, DEVICE)).toBeNull()
    })

    it.each([0, 4, 5, '2'])('ne convertit pas une version %s', (schemaVersion) => {
      expect(upgradeExport({ ...read(exportV2), schemaVersion }, DEVICE)).toBeNull()
    })
  })
})
