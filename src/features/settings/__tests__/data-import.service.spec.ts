// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toJsonExport } from '../logic/export-format'
import { createCarnetSettingsRepository } from '../repository/carnet-settings.repository'
import { createDataExportService } from '../service/data-export.service'
import {
  createDataImportService,
  parseExportFile,
  type DataImportDependencies,
} from '../service/data-import.service'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { ImportFile } from '@/shared/domain/import-plan'
import {
  CHPPIL_ID,
  IMPORT_FILE,
  IMPORT_FIXTURE,
  importFile,
  importFixtureJson,
  LEUCOSE_ID,
  LUNA_ID,
  MILBEMAX_ID,
  MILO_ID,
  MILO_WEIGHT_ID,
  PANACUR_ID,
  PANACUR_MATIN_ID,
  PANACUR_PERIOD_ID,
  PANACUR_REPORT_ID,
  PANACUR_SOIR_ID,
} from './import-fixture'
import { FIXTURE_DEVICE } from './export-fixture'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import type { NewTreatmentDose } from '@/features/treatments/schema/treatment-dose.schema'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'
import { headDose, seededTreatments } from '@/features/treatments/__tests__/seed-treatment'
import { treatmentScheduleOf } from '@/features/treatments/logic/treatment-schedule'
import { createTreatmentPlanService } from '@/features/treatments/service/treatment-plan.service'

const NOW = new Date('2026-09-15T10:00:00.000Z')
const IMPORTEUR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LUNA_PHOTO = IMPORT_FIXTURE.animals[0]!.photoFileName!
const TABLES = [
  'carnet_settings',
  'animal',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'weight_entry',
] as const

let db: InMemoryDb
let repositories: ReturnType<typeof createRepositories>

function createRepositories(client: InMemoryDb) {
  return {
    carnetSettings: createCarnetSettingsRepository(client),
    animals: createAnimalsRepository(client),
    vaccinations: createVaccinationsRepository(client),
    injections: createVaccinationInjectionsRepository(client),
    treatments: createTreatmentsRepository(client),
    seed: seededTreatments(client),
    periods: createTreatmentPeriodsRepository(client),
    doses: createTreatmentDosesRepository(client),
    weight: createWeightRepository(client),
    devices: createDeviceRepository(client),
  }
}

/** Prise donnée à son échéance, dans la première période de son traitement. */
function prise(
  dose: Pick<NewTreatmentDose, 'id' | 'treatmentId' | 'animalId' | 'nextDueDate'> & {
    givenOn: string
    at: string
  },
): NewTreatmentDose {
  const { at, ...fields } = dose
  return {
    ...fields,
    periodId: dose.treatmentId,
    dueOn: dose.givenOn,
    dueTime: null,
    status: 'given',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

function importerOn(
  client: InMemoryDb,
  now: () => Date = () => new Date(),
  overrides: Partial<DataImportDependencies> = {},
) {
  const to = createRepositories(client)
  return createDataImportService({
    carnetSettings: () => to.carnetSettings,
    animals: () => to.animals,
    vaccinations: () => to.vaccinations,
    vaccinationInjections: () => to.injections,
    treatments: async () => to.treatments,
    treatmentPeriods: () => to.periods,
    treatmentDoses: () => to.doses,
    weight: () => to.weight,
    devices: () => to.devices,
    deviceId: () => IMPORTEUR,
    photoExists: async () => false,
    syncReminders: async () => undefined,
    now,
    ...overrides,
  })
}

function setup(overrides: Partial<DataImportDependencies> = {}) {
  const syncReminders = vi.fn<() => Promise<void>>(async () => undefined)
  const photoExists = vi.fn<(name: string) => Promise<boolean>>(async () => false)
  const service = importerOn(db, () => NOW, { photoExists, syncReminders, ...overrides })
  return { service, syncReminders, photoExists }
}

function sorted(data: ExportData): ExportData {
  const byId = <T extends { id: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    carnetSettings: data.carnetSettings,
    animals: byId(data.animals),
    vaccinations: byId(data.vaccinations),
    vaccinationInjections: byId(data.vaccinationInjections),
    treatments: byId(data.treatments),
    treatmentPeriods: byId(data.treatmentPeriods),
    treatmentDoses: byId(data.treatmentDoses),
    weightEntries: byId(data.weightEntries),
    devices: byId(data.devices),
  }
}

async function carnet(client: InMemoryDb = db): Promise<ExportData> {
  const from = createRepositories(client)
  const data = await createDataExportService({
    carnetSettings: () => from.carnetSettings,
    animals: () => from.animals,
    vaccinations: () => from.vaccinations,
    vaccinationInjections: () => from.injections,
    treatments: () => from.treatments,
    treatmentPeriods: () => from.periods,
    treatmentDoses: () => from.doses,
    weight: () => from.weight,
    devices: () => from.devices,
    deliver: async () => 'shared',
    now: () => NOW,
    appVersion: 'test',
    weightUnit: () => 'kg',
  }).collect()
  return sorted(data)
}

/** Export JSON de l'appareil tel que l'import le relit. */
async function exported(client: InMemoryDb): Promise<ImportFile> {
  const text = toJsonExport(await carnet(client), { exportedAt: NOW, appVersion: 'test' })
  const parsed = parseExportFile(text)
  if (!parsed.ok) throw new Error(`export refusé : ${parsed.reason}`)
  return parsed.file
}

async function rowCounts(client: InMemoryDb = db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const [row] = await client.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    counts[table] = row!.count
  }
  return counts
}

function withoutPhotos(data: ExportData): ExportData {
  return sorted({
    ...data,
    animals: data.animals.map((animal) => ({ ...animal, photoFileName: null })),
  })
}

function newer<T extends { id: string; updatedAt: string }>(rows: T[], id: string): T[] {
  return rows.map((row) =>
    row.id === id ? { ...row, updatedAt: '2026-09-12T00:00:00.000Z' } : row,
  )
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

  it('importe un médicament sans prise : visible, à sa première échéance', async () => {
    const { service } = setup()
    const [milbemax] = IMPORT_FIXTURE.treatments
    const data: ExportData = {
      ...IMPORT_FIXTURE,
      treatments: IMPORT_FIXTURE.treatments.map((treatment) =>
        treatment.id === milbemax!.id ? { ...treatment, type: 'medication' } : treatment,
      ),
      treatmentPeriods: IMPORT_FIXTURE.treatmentPeriods.map((period) =>
        period.treatmentId === milbemax!.id ? { ...period, firstDueOn: '2026-10-05' } : period,
      ),
      treatmentDoses: IMPORT_FIXTURE.treatmentDoses.filter(
        ({ treatmentId }) => treatmentId !== milbemax!.id,
      ),
    }

    await service.importData({ schemaVersion: 4, data }, 'replace')

    await expect(repositories.treatments.getById(milbemax!.id)).resolves.toMatchObject({
      type: 'medication',
    })
    await expect(repositories.treatments.getWithHistory(milbemax!.id)).resolves.toMatchObject({
      periods: [{ firstDueOn: '2026-10-05' }],
      doses: [],
    })
    await expect(carnet()).resolves.toEqual(withoutPhotos(data))
  })

  it('importe un export dans une base vide : réglages, périodes, prises oubliées et reports à l’identique', async () => {
    const { service } = setup()

    await service.importData(IMPORT_FILE, 'replace')

    await expect(carnet()).resolves.toEqual(withoutPhotos(IMPORT_FIXTURE))
    await expect(repositories.carnetSettings.get()).resolves.toEqual({
      vaccineReminderTime: '18:30',
      remindBeforeDue: false,
    })
  })

  it('écrit les nouvelles colonnes de l’animal', async () => {
    const { service } = setup()
    const parti: ExportData = {
      ...IMPORT_FIXTURE,
      animals: IMPORT_FIXTURE.animals.map((animal) =>
        animal.id === MILO_ID
          ? {
              ...animal,
              unfollowedOn: '2026-09-14',
              departureReason: 'death',
              departureDate: '2026-09-12',
            }
          : animal,
      ),
    }

    await service.importData(importFile(parti), 'replace')

    await expect(
      db.query(
        `SELECT name, birth_date_approximate, unfollowed_on, departure_reason, departure_date
         FROM animal ORDER BY name`,
      ),
    ).resolves.toEqual([
      {
        name: 'Luna',
        birth_date_approximate: 1,
        unfollowed_on: null,
        departure_reason: null,
        departure_date: null,
      },
      {
        name: 'Milo',
        birth_date_approximate: 0,
        unfollowed_on: '2026-09-14',
        departure_reason: 'death',
        departure_date: '2026-09-12',
      },
    ])
  })

  it('lit dans l’app ce qu’il a écrit : rappel prévu d’un vaccin, période en cours d’un traitement', async () => {
    const { service } = setup()

    await service.importData(IMPORT_FILE, 'replace')

    await expect(repositories.vaccinations.getById(LEUCOSE_ID)).resolves.toMatchObject({
      lastInjectionDate: null,
      dueDate: '2026-11-02',
    })
    await expect(repositories.treatments.getById(PANACUR_ID)).resolves.toMatchObject({
      periodId: PANACUR_PERIOD_ID,
      frequency: { value: 1, unit: 'day' },
      stoppedOn: null,
    })
    const panacur = await repositories.treatments.getWithHistory(PANACUR_ID)
    expect(treatmentScheduleOf(panacur!, '2026-09-02').nextDue).toMatchObject({
      dueOn: '2026-09-03',
    })
  })

  it('ne duplique rien au second import, en fusion comme en remplacement', async () => {
    const { service } = setup()

    await service.importData(IMPORT_FILE, 'merge')
    const once = await rowCounts()
    await service.importData(IMPORT_FILE, 'merge')
    await service.importData(IMPORT_FILE, 'replace')

    await expect(rowCounts()).resolves.toEqual(once)
    expect(once).toEqual({
      carnet_settings: 1,
      animal: 2,
      vaccination: 3,
      vaccination_injection: 2,
      treatment: 2,
      treatment_period: 2,
      treatment_dose: 4,
      weight_entry: 2,
    })
    await expect(carnet()).resolves.toMatchObject({
      treatmentDoses: expect.objectContaining({ length: 4 }),
    })
  })

  it('reconstruit les rappels une fois l’import écrit, pas avant', async () => {
    const { service, syncReminders } = setup()
    let written: Record<string, number> = {}
    syncReminders.mockImplementation(async () => {
      written = await rowCounts()
    })

    await service.importData(IMPORT_FILE, 'merge')

    expect(syncReminders).toHaveBeenCalledOnce()
    expect(written).toMatchObject({ animal: 2, treatment_period: 2, treatment_dose: 4 })
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

      await service.importData(importFile(memePhoto), 'merge')

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

      await service.importData(importFile(memePhoto), 'replace')

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

        await expect(service.importData(importFile(deplace), mode)).rejects.toMatchObject({
          reason: 'reattached',
        })

        await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
          animalId: MILO_ID,
        })
        expect(syncReminders).not.toHaveBeenCalled()
      },
    )

    it.each([
      [
        'une prise sans traitement',
        'orphanEvent',
        { treatmentId: '12345678-1234-4234-8234-123456789012' },
      ],
      [
        'une prise sans période',
        'orphanEvent',
        { periodId: '12345678-1234-4234-8234-123456789012' },
      ],
      ['une prise d’un autre animal que son traitement', 'reattached', { animalId: LUNA_ID }],
      [
        'une prise qui vise la période d’un autre traitement',
        'reattached',
        { periodId: MILBEMAX_ID },
      ],
    ] as const)('refuse %s sans rien écrire', async (_, reason, change) => {
      const { service, syncReminders } = setup()
      const fautif = importFile({
        ...IMPORT_FIXTURE,
        treatmentDoses: IMPORT_FIXTURE.treatmentDoses.map((dose) =>
          dose.id === PANACUR_MATIN_ID ? { ...dose, ...change } : dose,
        ),
      })

      await expect(service.importData(fautif, 'merge')).rejects.toMatchObject({ reason })

      await expect(rowCounts()).resolves.toMatchObject({ animal: 0, treatment_dose: 0 })
      expect(syncReminders).not.toHaveBeenCalled()
    })

    it('refuse une période rattachée à un autre traitement que sur l’appareil, sans rien écrire', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      const before = await carnet()
      const deplacee = importFile({
        ...IMPORT_FIXTURE,
        treatmentPeriods: IMPORT_FIXTURE.treatmentPeriods.map((period) =>
          period.id === PANACUR_PERIOD_ID
            ? { ...period, treatmentId: MILBEMAX_ID, animalId: LUNA_ID }
            : period,
        ),
        treatmentDoses: [],
      })

      await expect(service.importData(deplacee, 'merge')).rejects.toMatchObject({
        reason: 'reattached',
      })

      await expect(carnet()).resolves.toEqual(before)
    })
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

      await service.importData(importFile(echeanceArbitraire), 'replace')

      await expect(headDose(repositories.treatments, MILBEMAX_ID)).resolves.toEqual({
        givenOn: '2026-06-15',
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
        data.carnetSettings!,
        ...data.animals,
        ...data.vaccinations,
        ...data.vaccinationInjections,
        ...data.treatments,
        ...data.treatmentPeriods,
        ...data.treatmentDoses,
        ...data.weightEntries,
      ]
      expect(rows.every(({ updatedAt }) => updatedAt === NOW.toISOString())).toBe(true)
      expect(data.animals.map(({ createdAt }) => createdAt).sort()).toEqual(
        IMPORT_FIXTURE.animals.map(({ createdAt }) => createdAt).sort(),
      )
    })

    it('une entrée déjà présente prend l’appareil qui importe, une entrée nouvelle garde le sien', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      const [luna] = (await carnet()).animals

      await service.importData(IMPORT_FILE, 'replace')

      const [lunaAgain] = (await carnet()).animals
      expect(luna).toMatchObject({
        createdByDevice: FIXTURE_DEVICE,
        updatedByDevice: FIXTURE_DEVICE,
      })
      expect(lunaAgain).toMatchObject({
        createdByDevice: FIXTURE_DEVICE,
        updatedByDevice: IMPORTEUR,
      })
    })
  })

  describe('appareils', () => {
    it('garde les appareils de l’appareil qui importe, même en remplacement', async () => {
      const { service } = setup()
      await repositories.devices.register(
        { id: IMPORTEUR, installedAt: '2026-09-01T00:00:00.000Z' },
        'Galaxy Tab S9',
      )

      await service.importData(IMPORT_FILE, 'replace')

      await expect(repositories.devices.listRecords()).resolves.toEqual([
        ...IMPORT_FIXTURE.devices,
        expect.objectContaining({ id: IMPORTEUR, model: 'Galaxy Tab S9' }),
      ])
    })

    it('garde la version la plus récente d’un appareil connu des deux côtés', async () => {
      const { service } = setup()
      const [pixel] = IMPORT_FIXTURE.devices
      await db.runMany([
        repositories.devices.restoreStatement(
          { ...pixel!, model: 'Pixel 8 Pro', updatedAt: '2026-09-14T00:00:00.000Z' },
          false,
        ),
      ])

      await service.importData(IMPORT_FILE, 'merge')

      await expect(repositories.devices.listRecords()).resolves.toMatchObject([
        { id: pixel!.id, model: 'Pixel 8 Pro' },
      ])
    })
  })

  describe('réglages du carnet', () => {
    it('en fusion, garde les réglages de l’appareil plus récents que ceux du fichier', async () => {
      const { service } = setup()
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })

      await service.importData(IMPORT_FILE, 'merge')

      await expect(repositories.carnetSettings.get()).resolves.toEqual({
        vaccineReminderTime: '07:15',
        remindBeforeDue: true,
      })
    })

    it('en fusion, prend ceux du fichier quand ils sont plus récents', async () => {
      const { service } = setup()
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })
      const recent = importFile({
        ...IMPORT_FIXTURE,
        carnetSettings: {
          ...IMPORT_FIXTURE.carnetSettings!,
          updatedAt: '2099-01-01T00:00:00.000Z',
        },
      })

      await service.importData(recent, 'merge')

      await expect(repositories.carnetSettings.getRecord()).resolves.toMatchObject({
        vaccineReminderTime: '18:30',
        remindBeforeDue: false,
        updatedAt: NOW.toISOString(),
      })
    })

    it('en remplacement, prend ceux du fichier', async () => {
      const { service } = setup()
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })

      await service.importData(IMPORT_FILE, 'replace')

      await expect(repositories.carnetSettings.get()).resolves.toMatchObject({
        vaccineReminderTime: '18:30',
      })
    })

    it('en remplacement par un fichier sans réglages, revient aux valeurs par défaut', async () => {
      const { service } = setup()
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })

      await service.importData(importFile({ ...IMPORT_FIXTURE, carnetSettings: null }), 'replace')

      await expect(repositories.carnetSettings.get()).resolves.toEqual({
        vaccineReminderTime: '09:00',
        remindBeforeDue: true,
      })
    })

    it('en fusion avec un fichier sans réglages, ne touche pas à ceux de l’appareil', async () => {
      const { service } = setup()
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })

      await service.importData(importFile({ ...IMPORT_FIXTURE, carnetSettings: null }), 'merge')

      await expect(repositories.carnetSettings.get()).resolves.toMatchObject({
        vaccineReminderTime: '07:15',
      })
    })
  })

  describe('fusion', () => {
    it('ajoute ce qui manque sans doublon ni perte des données locales', async () => {
      const { service } = setup()
      const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })

      await service.importData(IMPORT_FILE, 'merge')
      await service.importData(IMPORT_FILE, 'merge')

      const data = await carnet()
      expect(data.animals.map(({ name }) => name).sort()).toEqual(['Luna', 'Milo', 'Rex'])
      expect(data.animals.find(({ id }) => id === rex.id)).toMatchObject({ name: 'Rex' })
      expect(data.vaccinations).toHaveLength(3)
      expect(data.treatments).toHaveLength(2)
      expect(data.treatmentPeriods).toHaveLength(2)
      expect(data.treatmentDoses).toHaveLength(4)
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

      await service.importData(importFile(plusRecent), 'merge')

      await expect(repositories.animals.getById(MILO_ID)).resolves.toEqual(miloModifie)
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toMatchObject({
        name: 'CHPPiL + rage',
        createdAt: IMPORT_FIXTURE.vaccinations[0]!.createdAt,
        updatedAt: NOW.toISOString(),
      })
    })

    it('arbitre chaque ligne à part : une période corrigée dans le fichier, une prise notée sur l’appareil', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'replace')
      await db.run(
        `UPDATE treatment_dose SET status = 'given', given_on = '2026-09-01', updated_at = ?
         WHERE id = ?`,
        ['2030-06-01T00:00:00.000Z', PANACUR_SOIR_ID],
      )
      const corrigee: ExportData = {
        ...IMPORT_FIXTURE,
        treatmentPeriods: IMPORT_FIXTURE.treatmentPeriods.map((period) =>
          period.id === PANACUR_PERIOD_ID
            ? {
                ...period,
                times: ['07:30'],
                endsOn: null,
                doseQuantity: 2,
                doseUnit: 'ml',
                updatedAt: '2030-01-01T00:00:00.000Z',
              }
            : period,
        ),
      }

      await service.importData(importFile(corrigee), 'merge')

      const data = await carnet()
      expect(data.treatmentPeriods.find(({ id }) => id === PANACUR_PERIOD_ID)).toMatchObject({
        times: ['07:30'],
        endsOn: null,
        doseQuantity: 2,
        doseUnit: 'ml',
        reminderOffsetMinutes: 30,
      })
      expect(data.treatmentDoses.find(({ id }) => id === PANACUR_SOIR_ID)).toMatchObject({
        status: 'given',
        givenOn: '2026-09-01',
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
          repositories.injections.markDeletedByAnimalStatement(MILO_ID, deletedAt),
          repositories.treatments.markDeletedByAnimalStatement(MILO_ID, deletedAt),
          repositories.periods.markDeletedByAnimalStatement(MILO_ID, deletedAt),
          repositories.doses.markDeletedByAnimalStatement(MILO_ID, deletedAt),
          repositories.weight.markDeletedByAnimalStatement(MILO_ID, deletedAt),
        ],
        deletedAt,
      )
      const miloPlusRecent: ExportData = {
        ...IMPORT_FIXTURE,
        animals: newer(IMPORT_FIXTURE.animals, MILO_ID),
      }

      await service.importData(importFile(miloPlusRecent), 'merge')

      await expect(repositories.animals.getById(MILO_ID)).resolves.not.toBeNull()
      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.not.toBeNull()
      await expect(repositories.treatments.getById(PANACUR_ID)).resolves.toMatchObject({
        periodId: PANACUR_PERIOD_ID,
      })
      await expect(repositories.treatments.listDoses(PANACUR_ID)).resolves.toHaveLength(3)
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
      expect(new Set(data.vaccinations.map(({ animalId }) => animalId))).toEqual(new Set([LUNA_ID]))
    })
  })

  describe('lignes revenues avec leur parent', () => {
    const CANCELLED = '2026-09-05T00:00:00.000Z'
    const ADDED = '2026-09-01T00:00:00.000Z'

    it('ramène le vaccin avec l’injection supprimée avec lui, celle annulée avant reste annulée', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.runMany([
        repositories.injections.insertStatement({
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
      await repositories.vaccinations.remove(CHPPIL_ID)
      const fichier = importFile({
        ...IMPORT_FIXTURE,
        vaccinations: IMPORT_FIXTURE.vaccinations.map((vaccination) => ({
          ...vaccination,
          updatedAt: '2099-01-01T00:00:00.000Z',
        })),
        vaccinationInjections: [],
      })

      await importerOn(db).importData(fichier, 'merge')

      await expect(
        db.query(
          `SELECT id, deleted_at FROM vaccination_injection
           WHERE vaccination_id = ? ORDER BY injected_on`,
          [CHPPIL_ID],
        ),
      ).resolves.toEqual([
        { id: 'e1', deleted_at: null },
        { id: CHPPIL_ID, deleted_at: CANCELLED },
      ])
    })

    it('ramène le traitement avec sa période et ses prises, celle annulée avant reste annulée', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await db.run('UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        CANCELLED,
        CANCELLED,
        PANACUR_REPORT_ID,
      ])
      await repositories.treatments.remove(PANACUR_ID)
      const fichier = importFile({
        ...IMPORT_FIXTURE,
        treatments: IMPORT_FIXTURE.treatments.map((treatment) => ({
          ...treatment,
          updatedAt: '2099-01-01T00:00:00.000Z',
        })),
        treatmentPeriods: [IMPORT_FIXTURE.treatmentPeriods[0]!],
        treatmentDoses: [IMPORT_FIXTURE.treatmentDoses[0]!],
      })

      await importerOn(db).importData(fichier, 'merge')

      await expect(repositories.treatments.getById(PANACUR_ID)).resolves.toMatchObject({
        periodId: PANACUR_PERIOD_ID,
      })
      await expect(headDose(repositories.treatments, PANACUR_ID)).resolves.toMatchObject({
        nextDueDate: '2026-09-02',
      })
      await expect(
        db.query(
          `SELECT id, deleted_at FROM treatment_dose WHERE treatment_id = ?
           ORDER BY due_on, due_time`,
          [PANACUR_ID],
        ),
      ).resolves.toEqual([
        { id: PANACUR_MATIN_ID, deleted_at: null },
        { id: PANACUR_SOIR_ID, deleted_at: null },
        { id: PANACUR_REPORT_ID, deleted_at: CANCELLED },
      ])
    })

    it('ne ramène rien du fichier sous un vaccin ou un traitement resté supprimé', async () => {
      const { service } = setup()
      await service.importData(IMPORT_FILE, 'merge')
      await repositories.vaccinations.remove(CHPPIL_ID)
      await repositories.treatments.remove(PANACUR_ID)

      await importerOn(db).importData(IMPORT_FILE, 'merge')

      await expect(repositories.vaccinations.getById(CHPPIL_ID)).resolves.toBeNull()
      await expect(repositories.treatments.getById(PANACUR_ID)).resolves.toBeNull()
      const rows = await db.query<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM vaccination_injection WHERE vaccination_id = ?
         UNION ALL SELECT deleted_at FROM treatment_period WHERE treatment_id = ?
         UNION ALL SELECT deleted_at FROM treatment_dose WHERE treatment_id = ?`,
        [CHPPIL_ID, PANACUR_ID, PANACUR_ID],
      )
      expect(rows).toHaveLength(5)
      expect(rows.every(({ deleted_at }) => deleted_at !== null)).toBe(true)
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
        [MILO_ID, 'Milo'],
        [LUNA_ID, 'Luna'],
      ])
      const rexVersion = (await repositories.animals.listVersions()).find(({ id }) => id === rex.id)
      expect(rexVersion?.deletedAt).toBe(NOW.toISOString())
      const vaccins = await repositories.vaccinations.listVersions()
      expect(vaccins.filter(({ deletedAt }) => deletedAt === null)).toHaveLength(3)
      expect(vaccins).toHaveLength(4)
    })

    it('marque supprimés avec la même date les événements et les périodes des vaccins et traitements locaux', async () => {
      const { service } = setup()
      const rex = await repositories.animals.create({ name: 'Rex', species: 'dog' })
      const rage = await repositories.vaccinations.create({
        animalId: rex.id,
        name: 'Rage',
        lastInjectionDate: '2025-01-01',
      })
      const bravecto = await repositories.seed.create({
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
      await expect(
        db.query('SELECT deleted_at FROM treatment_period WHERE treatment_id = ?', [bravecto.id]),
      ).resolves.toEqual([{ deleted_at: NOW.toISOString() }])
    })
  })

  describe('tout ou rien', () => {
    async function carnetState(syncReminders: { mock: { calls: unknown[] } }) {
      return {
        animals: await repositories.animals.list(),
        rows: await rowCounts(),
        settings: await repositories.carnetSettings.getRecord(),
        reminderSyncs: syncReminders.mock.calls.length,
      }
    }

    /** Remplacement d'un carnet existant par un fichier que la base refuse. */
    async function failedImport(fautif: ExportData) {
      const { service, syncReminders } = setup()
      await repositories.animals.create({ name: 'Rex', species: 'dog' })
      await repositories.carnetSettings.update({ vaccineReminderTime: '07:15' })
      const before = await carnetState(syncReminders)
      const error = await service
        .importData(importFile(fautif), 'replace')
        .then(() => 'aucune erreur')
        .catch((cause: unknown) => String(cause))
      return { error, before, after: await carnetState(syncReminders) }
    }

    it('n’écrit rien et ne touche pas aux rappels si une contrainte de la base casse', async () => {
      const { error, before, after } = await failedImport({
        ...IMPORT_FIXTURE,
        animals: [
          ...IMPORT_FIXTURE.animals,
          { ...IMPORT_FIXTURE.animals[1]!, id: crypto.randomUUID(), species: 'rabbit' },
        ],
      } as unknown as ExportData)

      expect(error).toMatch(/CHECK/)
      expect(after).toEqual(before)
      expect(after).toMatchObject({ animals: [{ name: 'Rex' }], reminderSyncs: 0 })
    })

    it('annule tout quand la dernière écriture échoue, réglages et effacement compris', async () => {
      const [luna, milo] = IMPORT_FIXTURE.weightEntries
      const { error, before, after } = await failedImport({
        ...IMPORT_FIXTURE,
        weightEntries: [luna!, { ...milo!, weightKg: null as unknown as number }],
      })

      expect(error).toMatch(/NOT NULL/)
      expect(after).toEqual(before)
      expect(after.settings).toMatchObject({ vaccineReminderTime: '07:15' })
    })

    it('annule tout quand la base refuse une valeur que le schéma du fichier aurait dû arrêter', async () => {
      const { error, before, after } = await failedImport({
        ...IMPORT_FIXTURE,
        treatmentPeriods: IMPORT_FIXTURE.treatmentPeriods.map((period) => ({
          ...period,
          doseQuantity: 1,
          doseUnit: 'louche' as 'tablet',
        })),
      })

      expect(error).toMatch(/dose_unit not allowed/)
      expect(after).toEqual(before)
    })
  })

  describe('fichier hostile', () => {
    const INJECTION = `Rex'); DROP TABLE animal; --`

    it('écrit un nom porteur de SQL comme un simple texte', async () => {
      const text = importFixtureJson({
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) => ({ ...animal, name: INJECTION })),
        vaccinations: IMPORT_FIXTURE.vaccinations.map((vaccination) => ({
          ...vaccination,
          name: `" OR 1=1; DELETE FROM vaccination; --`,
        })),
      })
      const parsed = parseExportFile(text)
      if (!parsed.ok) throw new Error(parsed.reason)

      await setup().service.importData(parsed.file, 'replace')

      const data = await carnet()
      expect(data.animals.map(({ name }) => name)).toEqual([INJECTION, INJECTION])
      expect(data.vaccinations).toHaveLength(3)
      await expect(rowCounts()).resolves.toMatchObject({ animal: 2, vaccination: 3 })
    })

    it('ne passe aucune valeur du fichier dans le texte d’une instruction SQL', async () => {
      const statements: string[] = []
      const { service } = setup({
        animals: () => ({
          ...repositories.animals,
          runImport: async (batch) => {
            statements.push(...batch.map(({ sql }) => sql))
          },
        }),
      })
      const marked: ExportData = JSON.parse(
        JSON.stringify(IMPORT_FIXTURE)
          .replaceAll('Luna', 'MARQUEUR')
          .replaceAll('18:30', '18:31')
          .replaceAll('2026-09-01', '2026-08-31'),
      )

      await service.importData(importFile(marked), 'replace')

      const sql = statements.join('\n')
      expect(statements.length).toBeGreaterThan(20)
      for (const value of ['MARQUEUR', '18:31', '2026-08-31', LUNA_ID, 'tablet', '08:00']) {
        expect(sql).not.toContain(value)
      }
    })

    it('ne donne aucune photo à un nom de fichier qui sort du dossier des photos', async () => {
      const { service, photoExists } = setup()
      const traversal = importFile({
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) => ({
          ...animal,
          photoFileName: '../databases/memopatte.db',
        })),
      })

      await service.importData(traversal, 'replace')

      expect(photoExists).toHaveBeenCalledWith('../databases/memopatte.db')
      const photos = (await repositories.animals.list()).map(({ photoPath }) => photoPath)
      expect(photos).toEqual([null, null])
    })
  })

  describe('aller-retour', () => {
    async function carnetWithHistory(client: InMemoryDb) {
      const phone = createRepositories(client)
      const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
      const rage = await phone.vaccinations.create({
        animalId: milo.id,
        name: 'Rage',
        lastInjectionDate: '2023-05-20',
        dueDate: '2026-05-20',
      })
      await phone.injections.record({
        id: crypto.randomUUID(),
        vaccinationId: rage.id,
        animalId: milo.id,
        injectedOn: '2026-05-18',
        nextDueDate: '2029-05-18',
        createdAt: '2026-05-18T08:00:00.000Z',
        updatedAt: '2026-05-18T08:00:00.000Z',
        deletedAt: null,
      })
      const bravecto = await phone.seed.create({
        animalId: milo.id,
        name: 'Bravecto',
        type: 'antiparasitic',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-03-01',
      })
      await client.runMany([
        phone.doses.insertStatement(
          prise({
            id: crypto.randomUUID(),
            treatmentId: bravecto.id,
            animalId: milo.id,
            givenOn: '2026-06-01',
            nextDueDate: '2026-09-01',
            at: '2026-06-01T08:00:00.000Z',
          }),
        ),
      ])
      const drontal = await phone.seed.create({
        animalId: milo.id,
        name: 'Drontal',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        lastDoseDate: '2026-04-10',
      })
      await phone.periods.stop(drontal.id, '2026-05-01')
      await phone.weight.create({ animalId: milo.id, weightKg: 24.5, measuredOn: '2026-06-01' })
      await phone.carnetSettings.update({ remindBeforeDue: false })
    }

    it('un carnet saisi dans l’app, avec historique et traitement arrêté, revient à l’identique', async () => {
      const source = await createInMemoryDb()
      await carnetWithHistory(source)
      const syncReminders = vi.fn<() => Promise<void>>(async () => undefined)

      await importerOn(db, () => NOW, { syncReminders }).importData(
        await exported(source),
        'replace',
      )

      const before = await carnet(source)
      expect(before.vaccinationInjections).toHaveLength(2)
      expect(before.treatmentPeriods).toHaveLength(2)
      expect(before.treatmentDoses).toHaveLength(3)
      await expect(carnet()).resolves.toEqual(before)
      expect(syncReminders).toHaveBeenCalledOnce()
      source.close()
    })

    it('un traitement créé puis modifié par le formulaire, nouvelle période comprise, revient à l’identique', async () => {
      const source = await createInMemoryDb()
      await source.execute('PRAGMA foreign_keys = ON')
      const phone = createRepositories(source)
      const luna = await phone.animals.create({ name: 'Luna', species: 'cat' })
      const form = createTreatmentPlanService({
        treatments: () => phone.treatments,
        today: () => '2026-09-28',
        newId: () => crypto.randomUUID(),
      })
      const reglages = {
        frequency: { value: 1, unit: 'day' as const },
        times: ['20:00', '08:00'],
        doseQuantity: 0.5,
        doseUnit: 'ml' as const,
        endsOn: '2026-10-10',
      }
      const metacam = await form.create({
        animalId: luna.id,
        name: 'Métacam',
        type: 'medication',
        firstDoseOn: '2026-09-27',
        ...reglages,
      })
      await source.runMany([
        phone.doses.insertStatement({
          ...prise({
            id: crypto.randomUUID(),
            treatmentId: metacam.id,
            animalId: luna.id,
            givenOn: '2026-09-27',
            nextDueDate: '2026-09-27',
            at: '2026-09-27T08:00:00.000Z',
          }),
          dueTime: '08:00',
        }),
      ])
      const edition = { name: 'Métacam', type: 'medication' as const, ...reglages }
      await form.update(metacam.id, { ...edition, doseQuantity: 0.3, nextDoseOn: null })
      await form.update(metacam.id, { ...edition, doseQuantity: 0.3, nextDoseOn: '2026-09-30' })

      await importerOn(db, () => NOW).importData(await exported(source), 'replace')

      const before = await carnet(source)
      expect(before.treatmentPeriods).toHaveLength(2)
      expect(
        before.treatmentPeriods
          .map(({ firstDueOn, doseQuantity }) => [firstDueOn, doseQuantity])
          .sort(),
      ).toEqual([
        ['2026-09-27', 0.5],
        ['2026-09-30', 0.3],
      ])
      await expect(carnet()).resolves.toEqual(before)
      source.close()
    })

    it('un carnet avec périodes, heures, posologie, prises oubliées et report revient à l’identique', async () => {
      const source = await createInMemoryDb()
      await source.execute('PRAGMA foreign_keys = ON')
      await importerOn(source, () => NOW).importData(IMPORT_FILE, 'replace')
      const reprise = {
        ...IMPORT_FIXTURE.treatmentPeriods[0]!,
        id: crypto.randomUUID(),
        startsOn: '2026-09-01',
        firstDueOn: '2026-09-01',
        reminderTime: '19:00',
      }
      await source.runMany([
        createTreatmentPeriodsRepository(source).restoreStatement(reprise, false),
      ])
      await createTreatmentPeriodsRepository(source).stop(MILBEMAX_ID, '2026-09-20')

      await importerOn(db, () => NOW).importData(await exported(source), 'replace')

      const before = await carnet(source)
      expect(before.treatmentPeriods).toHaveLength(3)
      expect(before.treatmentDoses.map(({ status }) => status).sort()).toEqual([
        'given',
        'given',
        'missed',
        'postponed',
      ])
      await expect(carnet()).resolves.toEqual(before)
      source.close()
    })

    it('se réimporte sans rien dupliquer', async () => {
      const source = await createInMemoryDb()
      await carnetWithHistory(source)
      const file = await exported(source)
      source.close()

      await importerOn(db, () => NOW).importData(file, 'merge')
      const once = await rowCounts()
      await importerOn(db, () => NOW).importData(file, 'merge')

      await expect(rowCounts()).resolves.toEqual(once)
    })
  })

  describe('deux appareils', () => {
    function instantLocal(dateTime: string): string {
      return new Date(dateTime).toISOString()
    }

    function at(localDateTime: string): void {
      vi.setSystemTime(new Date(localDateTime))
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fusionne une prise plus ancienne que la dernière, notée en retard : la dernière prise ne change pas', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.seed.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 1, unit: 'week' },
        lastDoseDate: '2026-09-01',
      })
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')

      at('2026-09-09T08:00:00')
      await phoneB.runMany([
        createTreatmentDosesRepository(phoneB).insertStatement(
          prise({
            id: crypto.randomUUID(),
            treatmentId: milbemax.id,
            animalId: luna.id,
            givenOn: '2026-09-09',
            nextDueDate: '2026-09-16',
            at: instantLocal('2026-09-09T08:00:00'),
          }),
        ),
      ])
      at('2026-09-10T08:00:00')
      await phoneA.runMany([
        a.doses.insertStatement(
          prise({
            id: crypto.randomUUID(),
            treatmentId: milbemax.id,
            animalId: luna.id,
            givenOn: '2026-09-10',
            nextDueDate: '2026-09-17',
            at: instantLocal('2026-09-10T08:00:00'),
          }),
        ),
      ])

      await importerOn(phoneA).importData(await exported(phoneB), 'merge')

      await expect(headDose(createRepositories(phoneA).treatments, milbemax.id)).resolves.toEqual({
        givenOn: '2026-09-10',
        nextDueDate: '2026-09-17',
      })
      phoneB.close()
    })

    it('fait converger deux exports : renommé d’un côté, arrêté plus tard de l’autre, les deux sont gardés', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.seed.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
      })
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')

      at('2026-09-05T08:00:00')
      await createRepositories(phoneB).seed.update(milbemax.id, {
        name: 'Milbémax chat',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-09-15',
      })
      at('2026-09-10T08:00:00')
      await a.periods.stop(milbemax.id, '2026-09-10')

      at('2026-09-20T08:00:00')
      const [fromA, fromB] = [await exported(phoneA), await exported(phoneB)]
      await importerOn(phoneA).importData(fromB, 'merge')
      await importerOn(phoneB).importData(fromA, 'merge')

      for (const phone of [phoneA, phoneB]) {
        await expect(
          createRepositories(phone).treatments.getById(milbemax.id),
        ).resolves.toMatchObject({ name: 'Milbémax chat', stoppedOn: '2026-09-10' })
      }
      phoneB.close()
    })

    it('garde l’arrêt d’un appareil quand l’autre renomme le traitement plus tard', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.seed.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
      })
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')
      const b = createRepositories(phoneB)

      at('2026-09-05T09:00:00')
      await b.periods.stop(milbemax.id, '2026-09-05')
      at('2026-09-05T10:00:00')
      await a.seed.update(milbemax.id, {
        name: 'Milbémax chat',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-09-15',
      })

      at('2026-09-20T08:00:00')
      const [fromA, fromB] = [await exported(phoneA), await exported(phoneB)]
      await importerOn(phoneB).importData(fromA, 'merge')
      await importerOn(phoneA).importData(fromB, 'merge')

      for (const phone of [phoneA, phoneB]) {
        await expect(
          createRepositories(phone).treatments.getById(milbemax.id),
        ).resolves.toMatchObject({ name: 'Milbémax chat', stoppedOn: '2026-09-05' })
      }
      phoneB.close()
    })

    it('garde la date corrigée d’une prise quand l’autre appareil renomme le traitement plus tard', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.seed.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
      })
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')
      const b = createRepositories(phoneB)

      at('2026-09-05T09:00:00')
      await b.doses.applyBatch(
        [
          {
            action: 'rewrite',
            id: milbemax.id,
            dose: {
              periodId: milbemax.periodId,
              dueOn: '2026-06-20',
              dueTime: null,
              givenOn: '2026-06-20',
              status: 'given',
              nextDueDate: '2026-09-20',
            },
          },
        ],
        new Date().toISOString(),
      )
      at('2026-09-05T10:00:00')
      await a.seed.update(milbemax.id, {
        name: 'Milbémax chat',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-09-15',
      })

      at('2026-09-20T08:00:00')
      const [fromA, fromB] = [await exported(phoneA), await exported(phoneB)]
      await importerOn(phoneB).importData(fromA, 'merge')
      await importerOn(phoneA).importData(fromB, 'merge')

      for (const phone of [phoneA, phoneB]) {
        await expect(
          createRepositories(phone).treatments.getById(milbemax.id),
        ).resolves.toMatchObject({ name: 'Milbémax chat' })
        await expect(headDose(createRepositories(phone).treatments, milbemax.id)).resolves.toEqual({
          givenOn: '2026-06-20',
          nextDueDate: '2026-09-20',
        })
      }
      phoneB.close()
    })

    it('fait converger deux exports : fréquence corrigée d’un côté, prise notée de l’autre, qui garde la prochaine dose qu’elle a fixée', async () => {
      const phoneA = db
      const phoneB = await createInMemoryDb()
      await phoneB.execute('PRAGMA foreign_keys = ON')
      at('2026-09-01T08:00:00')
      const a = createRepositories(phoneA)
      const luna = await a.animals.create({ name: 'Luna', species: 'cat' })
      const milbemax = await a.seed.create({
        animalId: luna.id,
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-06-15',
      })
      at('2026-09-01T09:00:00')
      await importerOn(phoneB).importData(await exported(phoneA), 'replace')

      at('2026-09-10T08:00:00')
      await a.seed.update(milbemax.id, {
        name: 'Milbémax',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        nextDueDate: '2026-07-15',
      })
      at('2026-09-12T08:00:00')
      await phoneB.runMany([
        createTreatmentDosesRepository(phoneB).insertStatement(
          prise({
            id: crypto.randomUUID(),
            treatmentId: milbemax.id,
            animalId: luna.id,
            givenOn: '2026-09-12',
            nextDueDate: '2026-12-12',
            at: instantLocal('2026-09-12T08:00:00'),
          }),
        ),
      ])

      at('2026-09-20T08:00:00')
      const [fromA, fromB] = [await exported(phoneA), await exported(phoneB)]
      await importerOn(phoneA).importData(fromB, 'merge')
      await importerOn(phoneB).importData(fromA, 'merge')

      for (const phone of [phoneA, phoneB]) {
        await expect(
          createRepositories(phone).treatments.getById(milbemax.id),
        ).resolves.toMatchObject({ frequency: { value: 1, unit: 'month' } })
        await expect(headDose(createRepositories(phone).treatments, milbemax.id)).resolves.toEqual({
          givenOn: '2026-09-12',
          nextDueDate: '2026-12-12',
        })
      }
      const doses = async (phone: InMemoryDb) =>
        (await createRepositories(phone).treatments.listDoses(milbemax.id)).map(
          ({ id, givenOn, nextDueDate, frequency }) => ({ id, givenOn, nextDueDate, frequency }),
        )
      await expect(doses(phoneB)).resolves.toEqual(await doses(phoneA))
      phoneB.close()
    })
  })
})
