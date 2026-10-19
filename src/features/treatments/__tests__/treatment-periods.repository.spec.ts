// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  createTreatmentPeriodsRepository,
  getTreatmentPeriodsRepository,
  type RestoredTreatmentPeriod,
  type TreatmentPeriodsRepository,
} from '../repository/treatment-periods.repository'
import type {
  PeriodOrigin,
  TreatmentPeriod,
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const MILBEMAX = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const REPRISE = '55555555-5555-4555-8555-555555555555'
const T0 = '2026-01-01T00:00:00.000Z'
const EARLIER = '2026-02-01T00:00:00.000Z'
const NOW = '2026-03-01T10:00:00.000Z'

function period(overrides: Partial<TreatmentPeriod> = {}): TreatmentPeriod & PeriodOrigin {
  const firstDueOn = overrides.firstDueOn ?? overrides.startsOn ?? '2026-01-10'
  return {
    id: MILBEMAX,
    treatmentId: MILBEMAX,
    animalId: MIETTE,
    startsOn: '2026-01-10',
    frequency: { value: 3, unit: 'month' },
    stoppedOn: null,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
    firstDueOn,
    gridOriginOn: firstDueOn,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
  }
}

interface PeriodRow {
  id: string
  starts_on: string
  first_due_on: string
  frequency_value: number
  frequency_unit: string
  stopped_on: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

describe('treatmentPeriodsRepository', () => {
  let db: InMemoryDb
  let periods: TreatmentPeriodsRepository

  function rows(): Promise<PeriodRow[]> {
    return db.query<PeriodRow>(
      `SELECT id, starts_on, first_due_on, frequency_value, frequency_unit, stopped_on,
              created_at, updated_at, deleted_at
       FROM treatment_period ORDER BY created_at, id`,
    )
  }

  async function row(id: string): Promise<PeriodRow | undefined> {
    return (await rows()).find((candidate) => candidate.id === id)
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.runMany([
      {
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
              VALUES (?, 'Miette', 'cat', ?, ?, 'appareil-test', 'appareil-test'), (?, 'Vasco', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [MIETTE, T0, T0, VASCO, T0, T0],
      },
      {
        sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
              VALUES (?, ?, 'Milbemax', 'deworming', ?, ?, 'appareil-test', 'appareil-test'), (?, ?, 'Bravecto', 'antiparasitic', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [MILBEMAX, MIETTE, T0, T0, BRAVECTO, VASCO, T0, T0],
      },
    ])
    periods = createTreatmentPeriodsRepository(db)
    await db.runMany([
      periods.insertStatement(period()),
      periods.insertStatement(
        period({ id: BRAVECTO, treatmentId: BRAVECTO, animalId: VASCO, startsOn: '2026-01-20' }),
      ),
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('écrit une période sans fin, heures, posologie ni moment du rappel', async () => {
    await expect(row(MILBEMAX)).resolves.toEqual({
      id: MILBEMAX,
      starts_on: '2026-01-10',
      first_due_on: '2026-01-10',
      frequency_value: 3,
      frequency_unit: 'month',
      stopped_on: null,
      created_at: T0,
      updated_at: T0,
      deleted_at: null,
    })
    await expect(
      db.query(
        `SELECT ends_on, times, dose_quantity, dose_unit, reminder_offset_minutes, reminder_time
         FROM treatment_period WHERE id = ?`,
        [MILBEMAX],
      ),
    ).resolves.toEqual([
      {
        ends_on: null,
        times: null,
        dose_quantity: null,
        dose_unit: null,
        reminder_offset_minutes: null,
        reminder_time: null,
      },
    ])
  })

  describe('arrêt d’une période', () => {
    beforeEach(async () => {
      await db.runMany([
        periods.insertStatement(
          period({ id: REPRISE, startsOn: '2026-02-15', firstDueOn: '2026-02-15' }),
        ),
      ])
    })

    it('arrête la période donnée, pas les autres du traitement', async () => {
      vi.useFakeTimers({ now: new Date(NOW) })

      await expect(periods.stop(REPRISE, '2026-03-01')).resolves.toBe(true)

      await expect(row(REPRISE)).resolves.toMatchObject({
        stopped_on: '2026-03-01',
        updated_at: NOW,
      })
      await expect(row(MILBEMAX)).resolves.toMatchObject({ stopped_on: null, updated_at: T0 })
    })

    it('n’arrête pas de nouveau une période arrêtée : sa date d’arrêt est gardée', async () => {
      await periods.stop(REPRISE, '2026-02-20')

      await expect(periods.stop(REPRISE, '2026-03-01')).resolves.toBe(false)

      await expect(row(REPRISE)).resolves.toMatchObject({ stopped_on: '2026-02-20' })
    })

    it('n’arrête rien pour une période inconnue ou supprimée', async () => {
      await db.run('UPDATE treatment_period SET deleted_at = ? WHERE treatment_id = ?', [
        EARLIER,
        BRAVECTO,
      ])

      await expect(periods.stop('inconnu', '2026-03-01')).resolves.toBe(false)
      await expect(periods.stop(BRAVECTO, '2026-03-01')).resolves.toBe(false)
    })

    it('annule l’arrêt de la période donnée', async () => {
      await periods.stop(REPRISE, '2026-03-01')
      vi.useFakeTimers({ now: new Date(NOW) })

      await periods.undoStop(REPRISE)

      await expect(row(REPRISE)).resolves.toMatchObject({ stopped_on: null, updated_at: NOW })
    })
  })

  describe('période complète', () => {
    const REGLAGES: TreatmentPeriodSettings = {
      startsOn: '2026-02-10',
      firstDueOn: '2026-02-11',
      endsOn: '2026-03-10',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      reminderOffsetMinutes: 30,
      reminderTime: null,
    }
    const ORIGINE: PeriodOrigin = {
      gridOriginOn: REGLAGES.firstDueOn,
      firstDueChosen: false,
      fallenDosesAnswer: 'stay-unlogged',
    }
    const COMPLETE: TreatmentPeriodRecord = {
      ...period({ id: REPRISE, createdAt: EARLIER, updatedAt: EARLIER }),
      ...REGLAGES,
      ...ORIGINE,
      settingsWrittenAt: EARLIER,
      gridWrittenAt: EARLIER,
    }

    it('insère une période avec tous ses réglages et la relit à l’identique', async () => {
      await db.runMany([periods.insertStatement(COMPLETE)])

      await expect(periods.listByTreatment(MILBEMAX)).resolves.toEqual([
        expect.objectContaining({ id: MILBEMAX }),
        COMPLETE,
      ])
    })

    it('corrige tous les réglages de la période en cours, sans toucher à son arrêt ni aux autres périodes', async () => {
      await db.runMany([
        periods.insertStatement(
          period({ id: REPRISE, startsOn: '2026-02-01', stoppedOn: '2026-02-20' }),
        ),
      ])

      await db.runMany([periods.correctSettingsStatement(REPRISE, REGLAGES, NOW, ORIGINE)])

      const [first, current] = await periods.listByTreatment(MILBEMAX)
      expect(current).toEqual({
        ...period({ id: REPRISE, stoppedOn: '2026-02-20', updatedAt: NOW }),
        ...REGLAGES,
        ...ORIGINE,
        settingsWrittenAt: NOW,
        gridWrittenAt: NOW,
      })
      expect(first).toMatchObject({
        id: MILBEMAX,
        frequency: { value: 3, unit: 'month' },
        updatedAt: T0,
      })
      await expect(row(BRAVECTO)).resolves.toMatchObject({ updated_at: T0 })
    })

    it('efface la fin, les heures, la posologie et le moment du rappel', async () => {
      await db.runMany([periods.insertStatement(COMPLETE)])
      const sans: TreatmentPeriodSettings = {
        ...REGLAGES,
        endsOn: null,
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
      }

      await db.runMany([periods.correctSettingsStatement(REPRISE, sans, NOW, ORIGINE)])

      const [, current] = await periods.listByTreatment(MILBEMAX)
      expect(current).toEqual({
        ...COMPLETE,
        ...sans,
        updatedAt: NOW,
        settingsWrittenAt: NOW,
        gridWrittenAt: NOW,
      })
    })

    it('refuse d’insérer ou de corriger des réglages incohérents, sans rien écrire', async () => {
      const sansUnite = { ...REGLAGES, doseUnit: null }

      expect(() => periods.insertStatement({ ...COMPLETE, ...sansUnite })).toThrow(ZodError)
      expect(() =>
        periods.correctSettingsStatement(MILBEMAX, sansUnite, NOW, {
          ...ORIGINE,
          gridOriginOn: null,
        }),
      ).toThrow(ZodError)
    })

    it('ne date pas une période dont aucun réglage ne change', async () => {
      await db.runMany([periods.insertStatement(COMPLETE)])

      await db.runMany([periods.correctSettingsStatement(REPRISE, REGLAGES, NOW, ORIGINE)])

      await expect(row(REPRISE)).resolves.toMatchObject({ updated_at: EARLIER })
    })

    it.each<[string, Partial<PeriodOrigin>]>([['la date choisie', { firstDueChosen: true }]])(
      'date la période quand seule %s change',
      async (_, fact) => {
        await db.runMany([periods.insertStatement(COMPLETE)])

        await db.runMany([
          periods.correctSettingsStatement(REPRISE, REGLAGES, NOW, { ...ORIGINE, ...fact }),
        ])

        const [, current] = await periods.listByTreatment(MILBEMAX)
        expect(current).toEqual({
          ...COMPLETE,
          ...fact,
          updatedAt: NOW,
          settingsWrittenAt: NOW,
          gridWrittenAt: NOW,
        })
      },
    )

    it('écrit seule la réponse à la question des doses tombées sans dater le calendrier (v15)', async () => {
      await db.runMany([periods.insertStatement(COMPLETE)])

      await db.runMany([
        periods.correctSettingsStatement(REPRISE, REGLAGES, NOW, {
          ...ORIGINE,
          fallenDosesAnswer: 'not-due',
        }),
      ])

      const [, current] = await periods.listByTreatment(MILBEMAX)
      expect(current).toEqual({
        ...COMPLETE,
        fallenDosesAnswer: 'not-due',
        updatedAt: NOW,
        settingsWrittenAt: EARLIER,
      })
    })

    describe('date d’écriture des réglages (R10, #867)', () => {
      async function writtenAt(): Promise<{ updated_at: string; settings_written_at: string }> {
        const [found] = await db.query<{ updated_at: string; settings_written_at: string }>(
          'SELECT updated_at, settings_written_at FROM treatment_period WHERE id = ?',
          [REPRISE],
        )
        return found!
      }

      beforeEach(async () => {
        await db.runMany([periods.insertStatement(COMPLETE)])
      })

      it('vaut la création à l’écriture d’une période', async () => {
        await expect(writtenAt()).resolves.toEqual({
          updated_at: EARLIER,
          settings_written_at: EARLIER,
        })
      })

      it.each<[string, Partial<TreatmentPeriodSettings>, Partial<PeriodOrigin>]>([
        ['le début', { startsOn: '2026-02-12', firstDueOn: '2026-02-12' }, {}],
        ['la première échéance', { firstDueOn: '2026-02-13' }, {}],
        ['la fréquence', { frequency: { value: 2, unit: 'day' } }, {}],
        ['les heures', { times: ['06:00'] }, {}],
        ['l’origine de la grille', {}, { gridOriginOn: null }],
        ['la date choisie', {}, { firstDueChosen: true }],
      ])('avance quand %s change', async (_, settings, origin) => {
        await db.runMany([
          periods.correctSettingsStatement(REPRISE, { ...REGLAGES, ...settings }, NOW, {
            ...ORIGINE,
            ...origin,
          }),
        ])

        await expect(writtenAt()).resolves.toEqual({ updated_at: NOW, settings_written_at: NOW })
      })

      it.each<[string, Partial<TreatmentPeriodSettings>]>([
        ['la date de fin', { endsOn: '2026-03-20' }],
        ['la posologie', { doseQuantity: 1, doseUnit: 'capsule' }],
        ['le moment du rappel', { reminderOffsetMinutes: 60 }],
        ['l’heure du rappel', { reminderTime: '07:00' }],
      ])('reste quand seule %s change', async (_, settings) => {
        await db.runMany([
          periods.correctSettingsStatement(REPRISE, { ...REGLAGES, ...settings }, NOW, ORIGINE),
        ])

        await expect(writtenAt()).resolves.toEqual({
          updated_at: NOW,
          settings_written_at: EARLIER,
        })
      })

      it('reste à l’arrêt et à son « Annuler », par chaque chemin', async () => {
        vi.useFakeTimers({ now: new Date(NOW) })
        await periods.stop(REPRISE, '2026-03-01')
        await periods.undoStop(REPRISE)
        await db.runMany([
          periods.stopPeriodStatement(REPRISE, '2026-03-01', NOW),
          periods.undoStopPeriodStatement(REPRISE, '2026-03-01', NOW),
          periods.stopStatement(REPRISE, '2026-03-01', NOW),
          periods.undoStopStatement(REPRISE, NOW),
        ])

        await expect(writtenAt()).resolves.toEqual({
          updated_at: NOW,
          settings_written_at: EARLIER,
        })
      })

      it('reste à la suppression d’un traitement et à son « Annuler »', async () => {
        await db.runMany([
          periods.markDeletedByTreatmentStatement(MILBEMAX, NOW),
          periods.reviveByTreatmentStatement(MILBEMAX, NOW, NOW),
        ])

        await expect(writtenAt()).resolves.toEqual({
          updated_at: NOW,
          settings_written_at: EARLIER,
        })
      })
    })

    describe('date d’écriture de la grille : ce qui fait les échéances, heures exclues', () => {
      async function gridWrittenAt(): Promise<string> {
        const [found] = await db.query<{ grid_written_at: string }>(
          'SELECT grid_written_at FROM treatment_period WHERE id = ?',
          [REPRISE],
        )
        return found!.grid_written_at
      }

      beforeEach(async () => {
        await db.runMany([periods.insertStatement(COMPLETE)])
      })

      it('vaut la création à l’écriture d’une période', async () => {
        await expect(gridWrittenAt()).resolves.toBe(EARLIER)
      })

      it.each<[string, Partial<TreatmentPeriodSettings>, Partial<PeriodOrigin>]>([
        ['la première échéance', { firstDueOn: '2026-02-13' }, {}],
        ['la fréquence', { frequency: { value: 2, unit: 'day' } }, {}],
        ['l’origine de la grille', {}, { gridOriginOn: null }],
        ['la date choisie', {}, { firstDueChosen: true }],
        ['la date de fin', { endsOn: '2026-03-20' }, {}],
      ])('avance quand %s change', async (_, settings, origin) => {
        await db.runMany([
          periods.correctSettingsStatement(REPRISE, { ...REGLAGES, ...settings }, NOW, {
            ...ORIGINE,
            ...origin,
          }),
        ])

        await expect(gridWrittenAt()).resolves.toBe(NOW)
      })

      it.each<[string, Partial<TreatmentPeriodSettings>, Partial<PeriodOrigin>]>([
        ['les heures', { times: ['06:00'] }, {}],
        ['la posologie', { doseQuantity: 1, doseUnit: 'capsule' }, {}],
        ['le moment du rappel', { reminderOffsetMinutes: 60 }, {}],
        ['l’heure du rappel', { reminderTime: '07:00' }, {}],
        ['la réponse à la question des doses tombées', {}, { fallenDosesAnswer: 'not-due' }],
      ])('reste quand seule %s change', async (_, settings, origin) => {
        await db.runMany([
          periods.correctSettingsStatement(REPRISE, { ...REGLAGES, ...settings }, NOW, {
            ...ORIGINE,
            ...origin,
          }),
        ])

        await expect(row(REPRISE)).resolves.toMatchObject({ updated_at: NOW })
        await expect(gridWrittenAt()).resolves.toBe(EARLIER)
      })

      it('reste à l’arrêt, à la suppression et à leur « Annuler »', async () => {
        await db.runMany([
          periods.stopPeriodStatement(REPRISE, '2026-03-01', NOW),
          periods.undoStopPeriodStatement(REPRISE, '2026-03-01', NOW),
          periods.markDeletedByTreatmentStatement(MILBEMAX, NOW),
          periods.reviveByTreatmentStatement(MILBEMAX, NOW, NOW),
        ])

        await expect(gridWrittenAt()).resolves.toBe(EARLIER)
      })
    })
  })

  it('marque les périodes d’un traitement, sans changer la date de celles déjà supprimées', async () => {
    await db.runMany([
      periods.insertStatement(period({ id: REPRISE, deletedAt: EARLIER, updatedAt: EARLIER })),
    ])

    await db.runMany([periods.markDeletedByTreatmentStatement(MILBEMAX, NOW)])

    await expect(row(MILBEMAX)).resolves.toMatchObject({ deleted_at: NOW, updated_at: NOW })
    await expect(row(REPRISE)).resolves.toMatchObject({ deleted_at: EARLIER })
    await expect(row(BRAVECTO)).resolves.toMatchObject({ deleted_at: null })
  })

  it('marque les périodes d’un animal, sans toucher aux autres', async () => {
    await db.runMany([periods.markDeletedByAnimalStatement(MIETTE, NOW)])

    await expect(row(MILBEMAX)).resolves.toMatchObject({ deleted_at: NOW })
    await expect(row(BRAVECTO)).resolves.toMatchObject({ deleted_at: null })
  })

  it('rend les périodes d’un animal supprimées à cet instant, et elles seules', async () => {
    await db.runMany([
      periods.insertStatement(period({ id: REPRISE, deletedAt: EARLIER, updatedAt: EARLIER })),
      periods.markDeletedByAnimalStatement(MIETTE, NOW),
      periods.markDeletedByAnimalStatement(VASCO, NOW),
    ])

    await db.runMany([periods.reviveByAnimalStatement(MIETTE, NOW, '2026-03-02T08:00:00.000Z')])

    await expect(row(MILBEMAX)).resolves.toMatchObject({
      deleted_at: null,
      updated_at: '2026-03-02T08:00:00.000Z',
    })
    await expect(row(REPRISE)).resolves.toMatchObject({ deleted_at: EARLIER })
    await expect(row(BRAVECTO)).resolves.toMatchObject({ deleted_at: NOW })
  })

  describe('arrêt d’une période désignée', () => {
    it('arrête la période, et seulement si elle ne l’est pas déjà', async () => {
      await db.runMany([
        periods.stopPeriodStatement(MILBEMAX, '2026-03-01', NOW),
        periods.stopPeriodStatement(BRAVECTO, '2026-03-01', NOW),
      ])
      await db.runMany([periods.stopPeriodStatement(MILBEMAX, '2026-03-05', EARLIER)])

      await expect(row(MILBEMAX)).resolves.toMatchObject({
        stopped_on: '2026-03-01',
        updated_at: NOW,
      })
      await expect(row(BRAVECTO)).resolves.toMatchObject({ stopped_on: '2026-03-01' })
    })

    it('rétablit la période arrêtée ce jour-là, pas une période arrêtée un autre jour', async () => {
      await db.runMany([
        periods.stopPeriodStatement(MILBEMAX, '2026-03-01', NOW),
        periods.stopPeriodStatement(BRAVECTO, '2026-02-20', EARLIER),
      ])

      await db.runMany([
        periods.undoStopPeriodStatement(MILBEMAX, '2026-03-01', '2026-03-02T08:00:00.000Z'),
        periods.undoStopPeriodStatement(BRAVECTO, '2026-03-01', '2026-03-02T08:00:00.000Z'),
      ])

      await expect(row(MILBEMAX)).resolves.toMatchObject({
        stopped_on: null,
        updated_at: '2026-03-02T08:00:00.000Z',
      })
      await expect(row(BRAVECTO)).resolves.toMatchObject({
        stopped_on: '2026-02-20',
        updated_at: EARLIER,
      })
    })
  })

  it('marque toutes les périodes encore visibles', async () => {
    await db.run('UPDATE treatment_period SET deleted_at = ? WHERE id = ?', [EARLIER, BRAVECTO])

    await db.runMany([periods.markAllDeletedStatement(NOW)])

    await expect(row(MILBEMAX)).resolves.toMatchObject({ deleted_at: NOW })
    await expect(row(BRAVECTO)).resolves.toMatchObject({ deleted_at: EARLIER })
  })

  describe('export et import', () => {
    const COMPLETE: RestoredTreatmentPeriod = {
      id: REPRISE,
      treatmentId: MILBEMAX,
      animalId: MIETTE,
      startsOn: '2026-02-10',
      firstDueOn: '2026-02-11',
      gridOriginOn: '2026-01-31',
      firstDueChosen: true,
      fallenDosesAnswer: 'stay-unlogged',
      endsOn: '2026-03-10',
      stoppedOn: '2026-02-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      reminderOffsetMinutes: 30,
      reminderTime: null,
      createdAt: EARLIER,
      updatedAt: NOW,
      settingsWrittenAt: '2026-02-15T09:00:00.000Z',
      gridWrittenAt: '2026-02-12T09:00:00.000Z',
      createdByDevice: 'appareil-du-fichier',
      updatedByDevice: 'appareil-du-fichier',
    }

    it('insère une période importée avec toutes ses colonnes et la relit à l’identique', async () => {
      await db.runMany([periods.restoreStatement(COMPLETE, false)])

      const listed = await periods.listRecords()

      expect(listed.find(({ id }) => id === REPRISE)).toEqual({ ...COMPLETE, deletedAt: null })
      await expect(
        db.query('SELECT times FROM treatment_period WHERE id = ?', [REPRISE]),
      ).resolves.toEqual([{ times: '08:00,20:00' }])
    })

    it('lit une période écrite par l’app sans fin, heures, posologie ni moment du rappel', async () => {
      const listed = await periods.listAll()

      expect(listed.find(({ id }) => id === MILBEMAX)).toEqual({
        ...period(),
        gridOriginOn: '2026-01-10',
        firstDueChosen: true,
        fallenDosesAnswer: 'unasked',
        endsOn: null,
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
        settingsWrittenAt: T0,
        gridWrittenAt: T0,
      })
    })

    it('liste les périodes d’un traitement de la première à la dernière, sans les supprimées', async () => {
      await db.runMany([
        periods.restoreStatement(COMPLETE, false),
        periods.markDeletedByAnimalStatement(VASCO, NOW),
      ])

      await expect(periods.listAll()).resolves.toMatchObject([{ id: MILBEMAX }, { id: REPRISE }])
    })

    it('écrase les réglages d’une période existante, même supprimée, sans la changer de traitement', async () => {
      await db.run('UPDATE treatment_period SET deleted_at = ? WHERE id = ?', [EARLIER, MILBEMAX])

      await db.runMany([
        periods.restoreStatement(
          { ...COMPLETE, id: MILBEMAX, treatmentId: BRAVECTO, animalId: VASCO, times: [] },
          true,
        ),
      ])

      const listed = await periods.listRecords()
      expect(listed.find(({ id }) => id === MILBEMAX)).toEqual({
        ...COMPLETE,
        id: MILBEMAX,
        times: [],
        deletedAt: null,
      })
    })

    it('liste les versions de toutes les périodes, supprimées comprises', async () => {
      await db.runMany([periods.markDeletedByAnimalStatement(VASCO, NOW)])

      const versions = await periods.listVersions()

      expect(versions).toHaveLength(2)
      expect(versions).toContainEqual({
        id: MILBEMAX,
        treatmentId: MILBEMAX,
        animalId: MIETTE,
        updatedAt: T0,
        deletedAt: null,
      })
      expect(versions).toContainEqual({
        id: BRAVECTO,
        treatmentId: BRAVECTO,
        animalId: VASCO,
        updatedAt: NOW,
        deletedAt: NOW,
      })
    })

    it('ramène une période supprimée sans toucher ses réglages', async () => {
      await db.runMany([
        periods.markDeletedByAnimalStatement(MIETTE, EARLIER),
        periods.reviveStatement(MILBEMAX, NOW),
      ])

      const listed = await periods.listAll()
      expect(listed.find(({ id }) => id === MILBEMAX)).toMatchObject({
        startsOn: '2026-01-10',
        updatedAt: NOW,
        deletedAt: null,
      })
    })

    it('refuse une unité de posologie inconnue de la base', async () => {
      await expect(
        db.runMany([
          periods.restoreStatement({ ...COMPLETE, doseUnit: 'louche' as 'tablet' }, false),
        ]),
      ).rejects.toThrow(/dose_unit not allowed/)
    })
  })
})

describe('getTreatmentPeriodsRepository', () => {
  it('réessaie après une ouverture ratée', async () => {
    const db = await createInMemoryDb()
    vi.mocked(getDb).mockRejectedValueOnce(new Error('verrouillée')).mockResolvedValueOnce(db)

    await expect(getTreatmentPeriodsRepository()).rejects.toThrow('verrouillée')
    await expect(getTreatmentPeriodsRepository()).resolves.toHaveProperty('stop')
    db.close()
  })
})
