// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toJsonExport } from '../logic/export-format'
import { createDataExportService } from '../service/data-export.service'
import {
  createDataImportService,
  parseExportFile,
  type DataImportDependencies,
} from '../service/data-import.service'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { ImportFile } from '@/shared/domain/import-plan'
import type { ExportDataV1 } from '../logic/export-v1'
import {
  CHPPIL_ID,
  IMPORT_FILE,
  IMPORT_FIXTURE,
  IMPORT_FIXTURE_V1,
  LUNA_ID,
  MILBEMAX_ID,
  MILO_ID,
  MILO_WEIGHT_ID,
  TYPHUS_ID,
  v1File,
} from './import-fixture'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const NOW = new Date('2026-09-15T10:00:00.000Z')
const LUNA_PHOTO = IMPORT_FIXTURE.animals[0]!.photoFileName!

let db: InMemoryDb
let repositories: ReturnType<typeof createRepositories>

function createRepositories(client: InMemoryDb) {
  return {
    animals: createAnimalsRepository(client),
    vaccinations: createVaccinationsRepository(client),
    treatments: createTreatmentsRepository(client),
    weight: createWeightRepository(client),
  }
}

function setup(overrides: Partial<DataImportDependencies> = {}) {
  const syncReminders = vi.fn<() => Promise<void>>(async () => undefined)
  const photoExists = vi.fn<(name: string) => Promise<boolean>>(async () => false)
  const service = createDataImportService({
    animals: () => repositories.animals,
    vaccinations: () => repositories.vaccinations,
    vaccinationInjections: () => createVaccinationInjectionsRepository(db),
    treatments: async () => repositories.treatments,
    treatmentDoses: () => createTreatmentDosesRepository(db),
    weight: () => repositories.weight,
    photoExists,
    syncReminders,
    now: () => NOW,
    ...overrides,
  })
  return { service, syncReminders, photoExists }
}

function v2(data: ExportData): ImportFile {
  return { schemaVersion: 2, data }
}

function carnet(client: InMemoryDb = db): Promise<ExportData> {
  const from = createRepositories(client)
  return createDataExportService({
    animals: () => from.animals,
    vaccinations: () => from.vaccinations,
    vaccinationInjections: () => createVaccinationInjectionsRepository(client),
    treatments: () => from.treatments,
    treatmentDoses: () => createTreatmentDosesRepository(client),
    weight: () => from.weight,
    deliver: async () => 'shared',
    now: () => NOW,
    appVersion: 'test',
  }).collect()
}

/** Export JSON de l'appareil tel que l'import le relit. */
async function exported(client: InMemoryDb): Promise<ImportFile> {
  const text = toJsonExport(await carnet(client), { exportedAt: NOW, appVersion: 'test' })
  const parsed = parseExportFile(text)
  if (!parsed.ok) throw new Error(`export refusé : ${parsed.reason}`)
  return parsed.file
}

function importerOn(client: InMemoryDb, now: () => Date = () => new Date()) {
  const to = createRepositories(client)
  return createDataImportService({
    animals: () => to.animals,
    vaccinations: () => to.vaccinations,
    vaccinationInjections: () => createVaccinationInjectionsRepository(client),
    treatments: () => to.treatments,
    treatmentDoses: () => createTreatmentDosesRepository(client),
    weight: () => to.weight,
    photoExists: async () => false,
    syncReminders: async () => undefined,
    now,
  })
}

function parsedV1(): ImportFile {
  const parsed = parseExportFile(exportV1)
  if (!parsed.ok) throw new Error(`export v1 refusé : ${parsed.reason}`)
  return parsed.file
}

function events(client: InMemoryDb = db) {
  return client.query<{ id: string; parent_id: string; day: string; deleted_at: string | null }>(
    `SELECT id, vaccination_id AS parent_id, injected_on AS day, deleted_at FROM vaccination_injection
     UNION ALL
     SELECT id, treatment_id, given_on, deleted_at FROM treatment_dose
     ORDER BY parent_id, day`,
  )
}

function withoutPhotos(data: ExportData): ExportData {
  return { ...data, animals: data.animals.map((animal) => ({ ...animal, photoFileName: null })) }
}

beforeEach(async () => {
  db = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  repositories = createRepositories(db)
})

afterEach(() => {
  db.close()
})

describe('data-import.service', () => {
  it('sait si la base locale contient déjà un animal', async () => {
    const { service } = setup()
    await expect(service.hasLocalData()).resolves.toBe(false)

    await repositories.animals.create({ name: 'Rex', species: 'dog' })

    await expect(service.hasLocalData()).resolves.toBe(true)
  })

  it('importe un export dans une base vide, identifiants et dates d’origine compris', async () => {
    const { service } = setup()

    await service.importData(IMPORT_FILE, 'replace')

    await expect(carnet()).resolves.toEqual(withoutPhotos(IMPORT_FIXTURE))
  })

  it('écrit chaque vaccin et chaque traitement avec leur événement, sans doublon au second import', async () => {
    const { service } = setup()

    await service.importData(IMPORT_FILE, 'merge')
    await service.importData(IMPORT_FILE, 'replace')

    await expect(
      db.query('SELECT id, vaccination_id FROM vaccination_injection ORDER BY id'),
    ).resolves.toEqual([
      { id: CHPPIL_ID, vaccination_id: CHPPIL_ID },
      { id: TYPHUS_ID, vaccination_id: TYPHUS_ID },
    ])
    await expect(
      db.query('SELECT id, treatment_id, deleted_at FROM treatment_dose'),
    ).resolves.toEqual([{ id: MILBEMAX_ID, treatment_id: MILBEMAX_ID, deleted_at: null }])
  })

  it('reprogramme les rappels une fois l’import écrit', async () => {
    const { service, syncReminders } = setup()
    let animalsAtSync = -1
    syncReminders.mockImplementation(async () => {
      animalsAtSync = (await repositories.animals.list()).length
    })

    await service.importData(IMPORT_FILE, 'merge')

    expect(syncReminders).toHaveBeenCalledOnce()
    expect(animalsAtSync).toBe(2)
  })

  describe('photos', () => {
    it('garde la photo citée si son fichier est sur l’appareil, sinon le placeholder', async () => {
      const { service, photoExists } = setup()
      photoExists.mockImplementation(async (name) => name === LUNA_PHOTO)

      await service.importData(IMPORT_FILE, 'replace')

      await expect(repositories.animals.getById(LUNA_ID)).resolves.toMatchObject({
        photoPath: LUNA_PHOTO,
      })
      expect(photoExists).toHaveBeenCalledWith(LUNA_PHOTO)
    })

    it('n’efface pas la photo locale d’un animal écrasé par l’import', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      await db.run(`UPDATE animal SET photo_path = 'locale.jpg', updated_at = ? WHERE id = ?`, [
        '2026-01-01T00:00:00.000Z',
        LUNA_ID,
      ])

      await service.importData(IMPORT_FILE, 'merge')

      await expect(repositories.animals.getById(LUNA_ID)).resolves.toMatchObject({
        photoPath: 'locale.jpg',
      })
    })

    it('n’attribue pas une photo déjà utilisée par un autre animal', async () => {
      const { service } = setup({ photoExists: async () => true })
      const rex = await repositories.animals.create({
        name: 'Rex',
        species: 'dog',
        photoPath: LUNA_PHOTO,
      })
      const memePhoto: ExportData = {
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) => ({ ...animal, photoFileName: LUNA_PHOTO })),
      }

      await service.importData(v2(memePhoto), 'merge')

      const photos = (await repositories.animals.list()).map(({ id, photoPath }) => [id, photoPath])
      expect(photos).toEqual([
        [LUNA_ID, null],
        [MILO_ID, null],
        [rex.id, LUNA_PHOTO],
      ])
    })

    it('ne donne une même photo du fichier qu’à un seul animal', async () => {
      const { service } = setup({ photoExists: async () => true })
      const memePhoto: ExportData = {
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) => ({ ...animal, photoFileName: LUNA_PHOTO })),
      }

      await service.importData(v2(memePhoto), 'replace')

      const photos = (await repositories.animals.list()).map(({ photoPath }) => photoPath)
      expect(photos).toEqual([LUNA_PHOTO, null])
    })
  })

  describe('rattachement', () => {
    it.each(['merge', 'replace'] as const)(
      'refuse en %s un fichier qui rattache une entrée existante à un autre animal',
      async (mode) => {
        const { service, syncReminders } = setup()
        await service.importData(IMPORT_FILE, 'replace')
        syncReminders.mockClear()
        const deplace: ExportData = {
          ...IMPORT_FIXTURE,
          vaccinations: IMPORT_FIXTURE.vaccinations.map((vaccination) =>
            vaccination.id === CHPPIL_ID ? { ...vaccination, animalId: LUNA_ID } : vaccination,
          ),
        }

        await expect(service.importData(v2(deplace), mode)).rejects.toMatchObject({
          reason: 'reattached',
        })

        await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
          animalId: MILO_ID,
        })
        expect(syncReminders).not.toHaveBeenCalled()
      },
    )
  })

  describe('échéance d’un traitement', () => {
    it('reprend l’échéance du fichier telle quelle, sans la recalculer depuis la dernière prise', async () => {
      const { service } = setup()
      const echeanceArbitraire: ExportData = {
        ...IMPORT_FIXTURE,
        treatmentDoses: IMPORT_FIXTURE.treatmentDoses.map((dose) => ({
          ...dose,
          nextDueDate: '2027-01-31',
        })),
      }

      await service.importData(v2(echeanceArbitraire), 'replace')

      await expect(repositories.treatments.getById(MILBEMAX_ID)).resolves.toMatchObject({
        lastDoseDate: '2026-06-15',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2027-01-31',
      })
    })
  })

  describe('dates', () => {
    it('une entrée nouvelle garde ses dates, une entrée déjà présente prend la date de l’import', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      await expect(carnet()).resolves.toEqual(withoutPhotos(IMPORT_FIXTURE))

      await service.importData(IMPORT_FILE, 'replace')

      const data = await carnet()
      const rows = [
        ...data.animals,
        ...data.vaccinations,
        ...data.treatments,
        ...data.weightEntries,
      ]
      expect(rows.every(({ updatedAt }) => updatedAt === NOW.toISOString())).toBe(true)
      expect(data.animals.map(({ createdAt }) => createdAt)).toEqual(
        IMPORT_FIXTURE.animals.map(({ createdAt }) => createdAt),
      )
    })
  })

  describe('fusion', () => {
    it('ajoute ce qui manque sans doublon ni perte des données locales', async () => {
      const { service } = setup()
      const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })

      await service.importData(IMPORT_FILE, 'merge')
      await service.importData(IMPORT_FILE, 'merge')

      const data = await carnet()
      expect(data.animals.map(({ name }) => name)).toEqual(['Luna', 'Milo', 'Rex'])
      expect(data.animals.find(({ id }) => id === rex.id)).toMatchObject({ name: 'Rex' })
      expect(data.vaccinations).toHaveLength(2)
      expect(data.treatments).toHaveLength(1)
      expect(data.weightEntries).toHaveLength(2)
    })

    it('garde la version la plus récente d’une même entrée, locale ou importée', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      const miloModifie = await repositories.animals.update(MILO_ID, {
        name: 'Milo le grand',
        species: 'dog',
      })
      const plusRecent: ExportData = {
        ...IMPORT_FIXTURE,
        vaccinations: IMPORT_FIXTURE.vaccinations.map((vaccination) =>
          vaccination.id === CHPPIL_ID
            ? { ...vaccination, name: 'CHPPiL + rage', updatedAt: '2030-01-01T00:00:00.000Z' }
            : vaccination,
        ),
      }

      await service.importData(v2(plusRecent), 'merge')

      await expect(repositories.animals.getById(MILO_ID)).resolves.toEqual(miloModifie)
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
        name: 'CHPPiL + rage',
        createdAt: IMPORT_FIXTURE.vaccinations[0]!.createdAt,
        updatedAt: NOW.toISOString(),
      })
    })

    it('restaure le carnet supprimé avec un animal que le fichier rend à nouveau visible', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      await repositories.weight.remove(MILO_WEIGHT_ID)
      const deletedAt = '2026-09-10T00:00:00.000Z'
      await repositories.animals.remove(
        MILO_ID,
        [
          repositories.vaccinations.markDeletedByAnimalStatement(MILO_ID, deletedAt),
          createVaccinationInjectionsRepository(db).markDeletedByAnimalStatement(
            MILO_ID,
            deletedAt,
          ),
          repositories.weight.markDeletedByAnimalStatement(MILO_ID, deletedAt),
        ],
        deletedAt,
      )
      const miloPlusRecent: ExportData = {
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) =>
          animal.id === MILO_ID ? { ...animal, updatedAt: '2026-09-12T00:00:00.000Z' } : animal,
        ),
      }

      await service.importData(v2(miloPlusRecent), 'merge')

      await expect(repositories.animals.getById(MILO_ID)).resolves.not.toBeNull()
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.not.toBeNull()
      await expect(repositories.weight.getById(MILO_WEIGHT_ID)).resolves.toBeNull()
    })

    it('laisse supprimé un animal effacé après l’export, et n’importe pas son carnet', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      await repositories.animals.remove(MILO_ID)
      await db.run(`DELETE FROM vaccination WHERE id = ?`, [CHPPIL_ID])

      await service.importData(IMPORT_FILE, 'merge')

      const data = await carnet()
      expect(data.animals.map(({ id }) => id)).toEqual([LUNA_ID])
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toBeNull()
      expect(data.vaccinations.map(({ animalId }) => animalId)).toEqual([LUNA_ID])
    })
  })

  describe('remplacement', () => {
    it('marque supprimées les données locales puis rend visibles celles du fichier', async () => {
      const { service } = setup()
      const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })
      await repositories.vaccinations.create({
        animalId: rex.id,
        name: 'Rage',
        lastInjectionDate: '2025-01-01',
      })
      await service.importData(IMPORT_FILE, 'merge')
      await repositories.animals.update(MILO_ID, { name: 'Milo modifié', species: 'dog' })

      await service.importData(IMPORT_FILE, 'replace')

      const data = await carnet()
      expect(data.animals.map(({ id, name }) => [id, name])).toEqual([
        [LUNA_ID, 'Luna'],
        [MILO_ID, 'Milo'],
      ])
      const rexVersion = (await repositories.animals.listVersions()).find(({ id }) => id === rex.id)
      expect(rexVersion?.deletedAt).toBe(NOW.toISOString())
      const vaccins = await repositories.vaccinations.listVersions()
      expect(vaccins.filter(({ deletedAt }) => deletedAt === null)).toHaveLength(2)
      expect(vaccins).toHaveLength(3)
    })

    it('marque supprimés avec la même date les événements des vaccins et traitements locaux', async () => {
      const { service } = setup()
      const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })
      const rage = await repositories.vaccinations.create({
        animalId: rex.id,
        name: 'Rage',
        lastInjectionDate: '2025-01-01',
      })
      const bravecto = await repositories.treatments.create({
        animalId: rex.id,
        name: 'Bravecto',
        type: 'antiparasitic',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-07-01',
      })

      await service.importData(IMPORT_FILE, 'replace')

      await expect(
        db.query('SELECT deleted_at FROM vaccination_injection WHERE vaccination_id = ?', [
          rage.id,
        ]),
      ).resolves.toEqual([{ deleted_at: NOW.toISOString() }])
      await expect(
        db.query('SELECT deleted_at FROM treatment_dose WHERE treatment_id = ?', [bravecto.id]),
      ).resolves.toEqual([{ deleted_at: NOW.toISOString() }])
    })
  })

  it('n’écrit rien et ne touche pas aux rappels si une contrainte de la base casse', async () => {
    const { service, syncReminders } = setup()
    const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })
    const refuseParLaBase = {
      ...IMPORT_FIXTURE,
      animals: [
        ...IMPORT_FIXTURE.animals,
        { ...IMPORT_FIXTURE.animals[1]!, id: crypto.randomUUID(), species: 'rabbit' },
      ],
    } as unknown as ExportData

    await expect(service.importData(v2(refuseParLaBase), 'replace')).rejects.toThrow(/CHECK/)

    await expect(repositories.animals.list()).resolves.toEqual([rex])
    await expect(repositories.animals.listVersions()).resolves.toHaveLength(1)
    expect(syncReminders).not.toHaveBeenCalled()
  })

  describe('injections d’un fichier v1', () => {
    const FILE_UPDATED_AT = '2026-09-10T00:00:00.000Z'
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

    function injectionsOf(vaccinationId: string) {
      return db.query<{ id: string; injected_on: string; next_due_date: string | null }>(
        `SELECT id, injected_on, next_due_date FROM vaccination_injection
         WHERE vaccination_id = ? AND deleted_at IS NULL ORDER BY injected_on`,
        [vaccinationId],
      )
    }

    async function addInjection(id: string, injectedOn: string, nextDueDate: string) {
      await db.runMany([
        createVaccinationInjectionsRepository(db).insertStatement({
          id,
          vaccinationId: CHPPIL_ID,
          animalId: MILO_ID,
          injectedOn,
          nextDueDate,
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
          deletedAt: null,
        }),
      ])
    }

    function withChppil(lastInjectionDate: string, dueDate: string): ImportFile {
      return v1File({
        ...IMPORT_FIXTURE_V1,
        vaccinations: IMPORT_FIXTURE_V1.vaccinations.map((vaccination) =>
          vaccination.id === CHPPIL_ID
            ? { ...vaccination, lastInjectionDate, dueDate, updatedAt: FILE_UPDATED_AT }
            : vaccination,
        ),
      })
    }

    it('met à jour l’injection de même date et laisse la date des autres', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await addInjection('recente', '2026-09-01', '2027-09-01')

      await service.importData(withChppil('2026-09-01', '2029-09-01'), 'merge')

      await expect(injectionsOf(CHPPIL_ID)).resolves.toEqual([
        { id: CHPPIL_ID, injected_on: '2025-09-01', next_due_date: '2026-09-01' },
        { id: 'recente', injected_on: '2026-09-01', next_due_date: '2029-09-01' },
      ])
    })

    it('ajoute une injection neuve pour une date absente, une seule fois', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')

      await service.importData(withChppil('2026-03-01', '2027-03-01'), 'merge')
      await service.importData(withChppil('2026-03-01', '2027-03-01'), 'merge')

      const [ancienne, neuve] = await injectionsOf(CHPPIL_ID)
      expect(ancienne).toEqual({
        id: CHPPIL_ID,
        injected_on: '2025-09-01',
        next_due_date: '2026-09-01',
      })
      expect(neuve?.id).toMatch(UUID)
      expect(neuve).toMatchObject({ injected_on: '2026-03-01', next_due_date: '2027-03-01' })
      await expect(injectionsOf(CHPPIL_ID)).resolves.toHaveLength(2)
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
        lastInjectionDate: '2026-03-01',
        dueDate: '2027-03-01',
      })
    })

    it('n’écrit rien sur une injection de même date modifiée après le fichier', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.run(
        `UPDATE vaccination_injection SET next_due_date = '2027-01-01', updated_at = ? WHERE id = ?`,
        ['2026-09-12T00:00:00.000Z', CHPPIL_ID],
      )

      await service.importData(withChppil('2025-09-01', '2026-12-31'), 'merge')

      await expect(injectionsOf(CHPPIL_ID)).resolves.toEqual([
        { id: CHPPIL_ID, injected_on: '2025-09-01', next_due_date: '2027-01-01' },
      ])
    })

    it('en remplacement, ne garde que l’injection du fichier, sans réécrire la date d’une autre', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await addInjection('recente', '2026-09-01', '2027-09-01')

      await service.importData(withChppil('2026-09-01', '2029-09-01'), 'replace')

      await expect(injectionsOf(CHPPIL_ID)).resolves.toEqual([
        { id: 'recente', injected_on: '2026-09-01', next_due_date: '2029-09-01' },
      ])
      await expect(
        db.query('SELECT injected_on, deleted_at FROM vaccination_injection WHERE id = ?', [
          CHPPIL_ID,
        ]),
      ).resolves.toEqual([{ injected_on: '2025-09-01', deleted_at: NOW.toISOString() }])
    })
  })

  describe('prises d’un fichier v1', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

    function dosesOf(treatmentId: string) {
      return db.query<{
        id: string
        given_on: string
        next_due_date: string
        frequency_value: number
        frequency_unit: string
      }>(
        `SELECT id, given_on, next_due_date, frequency_value, frequency_unit FROM treatment_dose
         WHERE treatment_id = ? AND deleted_at IS NULL ORDER BY given_on`,
        [treatmentId],
      )
    }

    async function addDose(id: string, givenOn: string, nextDueDate: string) {
      await db.runMany([
        createTreatmentDosesRepository(db).insertStatement({
          id,
          treatmentId: MILBEMAX_ID,
          animalId: LUNA_ID,
          givenOn,
          nextDueDate,
          frequency: { value: 3, unit: 'month' },
          createdAt: '2026-09-16T00:00:00.000Z',
          updatedAt: '2026-09-16T00:00:00.000Z',
          deletedAt: null,
        }),
      ])
    }

    function withMilbemax(
      lastDoseDate: string,
      nextDueDate: string,
      { updatedAt = '2026-09-20T00:00:00.000Z', monthly = true } = {},
    ): ImportFile {
      const data: ExportDataV1 = {
        ...IMPORT_FIXTURE_V1,
        treatments: IMPORT_FIXTURE_V1.treatments.map((treatment) => ({
          ...treatment,
          frequency: monthly ? { value: 1, unit: 'month' } : treatment.frequency,
          lastDoseDate,
          nextDueDate,
          updatedAt,
        })),
      }
      return v1File(data)
    }

    it('met à jour la prise de même date, fréquence comprise, et laisse la date des autres', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await addDose('recente', '2026-09-15', '2026-12-15')

      await service.importData(withMilbemax('2026-09-15', '2026-10-15'), 'merge')

      await expect(dosesOf(MILBEMAX_ID)).resolves.toEqual([
        {
          id: MILBEMAX_ID,
          given_on: '2026-06-15',
          next_due_date: '2026-09-15',
          frequency_value: 3,
          frequency_unit: 'month',
        },
        {
          id: 'recente',
          given_on: '2026-09-15',
          next_due_date: '2026-10-15',
          frequency_value: 1,
          frequency_unit: 'month',
        },
      ])
    })

    it('ajoute une prise neuve pour une date absente, une seule fois', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')

      await service.importData(withMilbemax('2026-08-01', '2026-09-01'), 'merge')
      await service.importData(withMilbemax('2026-08-01', '2026-09-01'), 'merge')

      const [ancienne, neuve] = await dosesOf(MILBEMAX_ID)
      expect(ancienne).toMatchObject({ id: MILBEMAX_ID, given_on: '2026-06-15' })
      expect(neuve?.id).toMatch(UUID)
      expect(neuve).toMatchObject({ given_on: '2026-08-01', next_due_date: '2026-09-01' })
      await expect(dosesOf(MILBEMAX_ID)).resolves.toHaveLength(2)
    })

    it('n’écrit rien sur une prise de même date modifiée après le fichier', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.run(
        `UPDATE treatment_dose SET next_due_date = '2026-10-01', updated_at = ? WHERE id = ?`,
        ['2026-09-18T00:00:00.000Z', MILBEMAX_ID],
      )

      await service.importData(
        withMilbemax('2026-06-15', '2026-07-15', {
          updatedAt: '2026-09-17T00:00:00.000Z',
          monthly: false,
        }),
        'merge',
      )

      await expect(dosesOf(MILBEMAX_ID)).resolves.toEqual([
        {
          id: MILBEMAX_ID,
          given_on: '2026-06-15',
          next_due_date: '2026-10-01',
          frequency_value: 3,
          frequency_unit: 'month',
        },
      ])
    })

    it('en remplacement, ne garde que la prise du fichier, sans réécrire la date d’une autre', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await addDose('recente', '2026-09-15', '2026-12-15')

      await service.importData(withMilbemax('2026-09-15', '2026-10-15'), 'replace')

      await expect(dosesOf(MILBEMAX_ID)).resolves.toMatchObject([
        { id: 'recente', given_on: '2026-09-15', next_due_date: '2026-10-15' },
      ])
      await expect(
        db.query('SELECT given_on, deleted_at FROM treatment_dose WHERE id = ?', [MILBEMAX_ID]),
      ).resolves.toEqual([{ given_on: '2026-06-15', deleted_at: NOW.toISOString() }])
    })
  })

  describe('événements revenus avec leur animal', () => {
    const CANCELLED = '2026-09-05T00:00:00.000Z'
    const CASCADE = '2026-09-10T00:00:00.000Z'
    const ADDED = '2026-09-01T00:00:00.000Z'

    function withNewerAnimal(animalId: string): ImportFile {
      return v1File({
        ...IMPORT_FIXTURE_V1,
        animals: IMPORT_FIXTURE_V1.animals.map((animal) =>
          animal.id === animalId ? { ...animal, updatedAt: '2026-09-12T00:00:00.000Z' } : animal,
        ),
      })
    }

    async function removeAnimal(animalId: string): Promise<void> {
      await repositories.animals.remove(
        animalId,
        [
          repositories.vaccinations.markDeletedByAnimalStatement(animalId, CASCADE),
          createVaccinationInjectionsRepository(db).markDeletedByAnimalStatement(animalId, CASCADE),
          repositories.treatments.markDeletedByAnimalStatement(animalId, CASCADE),
          createTreatmentDosesRepository(db).markDeletedByAnimalStatement(animalId, CASCADE),
          repositories.weight.markDeletedByAnimalStatement(animalId, CASCADE),
        ],
        CASCADE,
      )
    }

    it('ramène le vaccin avec l’injection supprimée avec lui, celle annulée avant reste annulée', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.runMany([
        createVaccinationInjectionsRepository(db).insertStatement({
          id: 'e1',
          vaccinationId: CHPPIL_ID,
          animalId: MILO_ID,
          injectedOn: '2024-09-01',
          nextDueDate: '2025-09-01',
          createdAt: ADDED,
          updatedAt: ADDED,
          deletedAt: null,
        }),
      ])
      await db.run('UPDATE vaccination_injection SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        CANCELLED,
        CANCELLED,
        CHPPIL_ID,
      ])
      await removeAnimal(MILO_ID)

      await service.importData(withNewerAnimal(MILO_ID), 'merge')

      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
        lastInjectionDate: '2024-09-01',
        dueDate: '2025-09-01',
      })
      await expect(
        db.query(
          `SELECT id, injected_on, deleted_at FROM vaccination_injection
           WHERE vaccination_id = ? ORDER BY injected_on`,
          [CHPPIL_ID],
        ),
      ).resolves.toEqual([
        { id: 'e1', injected_on: '2024-09-01', deleted_at: null },
        { id: CHPPIL_ID, injected_on: '2025-09-01', deleted_at: CANCELLED },
      ])
    })

    it('ramène l’événement de même date supprimé avec son parent aux valeurs du fichier', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      vi.useFakeTimers({ now: new Date(ADDED), toFake: ['Date'] })
      try {
        await repositories.treatments.update(MILBEMAX_ID, {
          name: 'Milbémax',
          type: 'deworming',
          frequency: { value: 1, unit: 'month' },
          nextDueDate: '2026-07-15',
        })
        await repositories.vaccinations.update(TYPHUS_ID, {
          name: 'Typhus',
          lastInjectionDate: '2024-05-20',
          dueDate: '2027-05-20',
        })
      } finally {
        vi.useRealTimers()
      }
      await removeAnimal(LUNA_ID)

      await service.importData(withNewerAnimal(LUNA_ID), 'merge')

      await expect(repositories.treatments.getById(MILBEMAX_ID)).resolves.toMatchObject({
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
        nextDueDate: '2026-09-15',
      })
      await expect(repositories.vaccinations.getById(TYPHUS_ID)).resolves.toMatchObject({
        lastInjectionDate: '2024-05-20',
        dueDate: null,
      })
    })

    it('ramène le traitement avec la prise supprimée avec lui, celle annulée avant reste annulée', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.runMany([
        createTreatmentDosesRepository(db).insertStatement({
          id: 'd1',
          treatmentId: MILBEMAX_ID,
          animalId: LUNA_ID,
          givenOn: '2026-03-15',
          nextDueDate: '2026-06-15',
          frequency: { value: 3, unit: 'month' },
          createdAt: ADDED,
          updatedAt: ADDED,
          deletedAt: null,
        }),
      ])
      await db.run('UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        CANCELLED,
        CANCELLED,
        MILBEMAX_ID,
      ])
      await removeAnimal(LUNA_ID)

      await service.importData(withNewerAnimal(LUNA_ID), 'merge')

      await expect(repositories.treatments.getById(MILBEMAX_ID)).resolves.toMatchObject({
        lastDoseDate: '2026-03-15',
        nextDueDate: '2026-06-15',
      })
      await expect(
        db.query(
          `SELECT id, given_on, deleted_at FROM treatment_dose
           WHERE treatment_id = ? ORDER BY given_on`,
          [MILBEMAX_ID],
        ),
      ).resolves.toEqual([
        { id: 'd1', given_on: '2026-03-15', deleted_at: null },
        { id: MILBEMAX_ID, given_on: '2026-06-15', deleted_at: CANCELLED },
      ])
    })
  })

  describe('export v1 réel de la 0.1.37', () => {
    const RAGE = 'c926e5b4-b1c3-4773-bb3f-34e0acdb67da'
    const MILO = 'f53143ec-dca0-430d-a77d-755f592ae425'

    it('s’importe deux fois sans rien dupliquer : un événement par vaccin et traitement', async () => {
      const { service } = setup()

      await service.importData(parsedV1(), 'merge')
      const once = await events()
      await service.importData(parsedV1(), 'merge')
      await service.importData(parsedV1(), 'replace')

      expect(once).toHaveLength(6)
      expect(once.every(({ id, parent_id }) => id === parent_id)).toBe(true)
      expect(await events()).toEqual(once)
      await expect(repositories.treatments.listAll()).resolves.toHaveLength(3)
    })

    it('ne réécrit jamais la date d’une autre injection du même vaccin', async () => {
      const { service } = setup()
      await service.importData(parsedV1(), 'merge')
      await createVaccinationInjectionsRepository(db).record({
        id: 'rappel-suivant',
        vaccinationId: RAGE,
        animalId: MILO,
        injectedOn: '2026-09-24',
        nextDueDate: '2027-09-24',
        createdAt: '2026-09-24T08:00:00.000Z',
        updatedAt: '2026-09-24T08:00:00.000Z',
        deletedAt: null,
      })

      await service.importData(parsedV1(), 'merge')

      await expect(repositories.vaccinations.listInjections(RAGE)).resolves.toMatchObject([
        { id: 'rappel-suivant', injectedOn: '2026-09-24', nextDueDate: '2027-09-24' },
        { id: RAGE, injectedOn: '2026-09-21', nextDueDate: '2029-09-21' },
      ])
    })
  })

  describe('export v2', () => {
    async function carnetWithHistory(client: InMemoryDb) {
      const phone = createRepositories(client)
      const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
      const rage = await phone.vaccinations.create({
        animalId: milo.id,
        name: 'Rage',
        lastInjectionDate: '2023-05-20',
        dueDate: '2026-05-20',
      })
      await createVaccinationInjectionsRepository(client).record({
        id: crypto.randomUUID(),
        vaccinationId: rage.id,
        animalId: milo.id,
        injectedOn: '2026-05-18',
        nextDueDate: '2029-05-18',
        createdAt: '2026-05-18T08:00:00.000Z',
        updatedAt: '2026-05-18T08:00:00.000Z',
        deletedAt: null,
      })
      const bravecto = await phone.treatments.create({
        animalId: milo.id,
        name: 'Bravecto',
        type: 'antiparasitic',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-03-01',
      })
      await createTreatmentDosesRepository(client).record({
        id: crypto.randomUUID(),
        treatmentId: bravecto.id,
        animalId: milo.id,
        givenOn: '2026-06-01',
        nextDueDate: '2026-09-01',
        frequency: { value: 3, unit: 'month' },
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: '2026-06-01T08:00:00.000Z',
        deletedAt: null,
      })
      const drontal = await phone.treatments.create({
        animalId: milo.id,
        name: 'Drontal',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        lastDoseDate: '2026-04-10',
      })
      await phone.treatments.stop(drontal.id, '2026-05-01')
      await phone.weight.create({ animalId: milo.id, weightKg: 24.5, measuredOn: '2026-06-01' })
      return { rage, bravecto }
    }

    it('fait l’aller-retour : un carnet avec historique revient à l’identique', async () => {
      const source = await createInMemoryDb()
      await carnetWithHistory(source)

      await importerOn(db, () => NOW).importData(await exported(source), 'replace')

      const before = await carnet(source)
      expect(before.vaccinationInjections).toHaveLength(2)
      expect(before.treatmentDoses).toHaveLength(3)
      await expect(carnet()).resolves.toEqual(before)
      source.close()
    })

    it('se réimporte sans rien dupliquer', async () => {
      const source = await createInMemoryDb()
      await carnetWithHistory(source)
      const file = await exported(source)
      source.close()

      await importerOn(db, () => NOW).importData(file, 'merge')
      const once = await events()
      await importerOn(db, () => NOW).importData(file, 'merge')

      await expect(events()).resolves.toEqual(once)
    })

    it('ramène un vaccin supprimé seul avec ses injections, quand le fichier est plus récent', async () => {
      const { rage } = await carnetWithHistory(db)
      const file = await exported(db)
      await repositories.vaccinations.remove(rage.id)
      const newer = v2({
        ...file.data,
        vaccinations: file.data.vaccinations.map((vaccination) => ({
          ...vaccination,
          updatedAt: '2099-01-01T00:00:00.000Z',
        })),
      })

      await importerOn(db).importData(newer, 'merge')

      await expect(repositories.vaccinations.listInjections(rage.id)).resolves.toHaveLength(2)
    })

    it('ne ramène aucune injection du fichier sous un vaccin resté supprimé', async () => {
      const { rage } = await carnetWithHistory(db)
      const file = await exported(db)
      await repositories.vaccinations.remove(rage.id)

      await importerOn(db).importData(file, 'merge')

      await expect(repositories.vaccinations.getById(rage.id)).resolves.toBeNull()
      const rows = await db.query<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM vaccination_injection WHERE vaccination_id = ?',
        [rage.id],
      )
      expect(rows.every(({ deleted_at }) => deleted_at !== null)).toBe(true)
    })

    it.each([
      ['un événement sans parent', 'orphanEvent', 'treatmentId', 'traitement-inconnu'],
      ['un événement d’un autre animal que son parent', 'reattached', 'animalId', MILO_ID],
    ] as const)('refuse %s sans rien écrire', async (_, reason, field, value) => {
      const { service, syncReminders } = setup()
      const [dose] = IMPORT_FIXTURE.treatmentDoses
      const fautif = v2({
        ...IMPORT_FIXTURE,
        treatmentDoses: [{ ...dose!, id: crypto.randomUUID(), [field]: value }],
      })

      await expect(service.importData(fautif, 'merge')).rejects.toMatchObject({ reason })

      await expect(repositories.animals.listVersions()).resolves.toEqual([])
      expect(syncReminders).not.toHaveBeenCalled()
    })
  })

  describe('réconciliation des prises à fréquence périmée', () => {
    function at(instant: string): void {
      vi.setSystemTime(new Date(instant))
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fait converger deux exports : fréquence changée d’un côté, prise notée de l’autre', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00.000Z')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.treatments.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
      })
      at('2026-09-01T09:00:00.000Z')
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')

      at('2026-09-10T08:00:00.000Z')
      await a.treatments.update(milbemax.id, {
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        nextDueDate: '2026-07-15',
      })
      at('2026-09-12T08:00:00.000Z')
      await createTreatmentDosesRepository(phoneB).record({
        id: crypto.randomUUID(),
        treatmentId: milbemax.id,
        animalId: luna.id,
        givenOn: '2026-09-12',
        nextDueDate: '2026-12-12',
        frequency: { value: 3, unit: 'month' },
        createdAt: '2026-09-12T08:00:00.000Z',
        updatedAt: '2026-09-12T08:00:00.000Z',
        deletedAt: null,
      })

      at('2026-09-20T08:00:00.000Z')
      const [fromA, fromB] = [await exported(phoneA), await exported(phoneB)]
      await importerOn(phoneA).importData(fromB, 'merge')
      await importerOn(phoneB).importData(fromA, 'merge')

      for (const phone of [phoneA, phoneB]) {
        await expect(
          createRepositories(phone).treatments.getById(milbemax.id),
        ).resolves.toMatchObject({
          frequency: { value: 1, unit: 'month' },
          lastDoseDate: '2026-09-12',
          nextDueDate: '2026-10-12',
        })
      }
      const doses = async (phone: InMemoryDb) =>
        (await createRepositories(phone).treatments.listDoses(milbemax.id)).map(
          ({ id, givenOn, nextDueDate, frequency }) => ({ id, givenOn, nextDueDate, frequency }),
        )
      await expect(doses(phoneB)).resolves.toEqual(await doses(phoneA))
      phoneB.close()
    })

    it('se joue dans la transaction de l’import, après toutes les écritures', async () => {
      const { service } = setup()
      const runImport = vi.spyOn(repositories.animals, 'runImport')

      await service.importData(IMPORT_FILE, 'merge')

      expect(runImport).toHaveBeenCalledOnce()
      expect(runImport.mock.calls[0]![0].at(-1)).toEqual(
        createTreatmentDosesRepository(db).reconcileStaleHeadsStatement(NOW.toISOString()),
      )
    })
  })
})
