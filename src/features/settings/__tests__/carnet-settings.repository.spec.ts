// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  CARNET_SETTINGS_ID,
  createCarnetSettingsRepository,
  getCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '../repository/carnet-settings.repository'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

interface SettingsRow {
  id: string
  vaccine_reminder_time: string
  remind_before_due: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

describe('carnetSettingsRepository', () => {
  let db: InMemoryDb
  let repository: CarnetSettingsRepository

  function rows(): Promise<SettingsRow[]> {
    return db.query<SettingsRow>('SELECT * FROM carnet_settings')
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createCarnetSettingsRepository(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('carnet_settings')
  })

  it('donne les réglages par défaut tant que rien n’a été réglé, sans rien écrire', async () => {
    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '09:00',
      remindBeforeDue: true,
    })
    await expect(rows()).resolves.toEqual([])
  })

  it('enregistre un réglage sans toucher à l’autre', async () => {
    await expect(repository.update({ remindBeforeDue: false })).resolves.toEqual({
      vaccineReminderTime: '09:00',
      remindBeforeDue: false,
    })

    await repository.update({ vaccineReminderTime: '08:30' })

    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '08:30',
      remindBeforeDue: false,
    })
  })

  it('écrit toujours la même ligne, à l’identifiant fixe partagé par les appareils', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T08:00:00.000Z'), toFake: ['Date'] })
    await repository.update({ remindBeforeDue: false })
    vi.setSystemTime(new Date('2026-10-02T08:00:00.000Z'))

    await repository.update({ vaccineReminderTime: '07:45' })

    await expect(rows()).resolves.toEqual([
      {
        id: CARNET_SETTINGS_ID,
        vaccine_reminder_time: '07:45',
        remind_before_due: 0,
        created_at: '2026-10-01T08:00:00.000Z',
        updated_at: '2026-10-02T08:00:00.000Z',
        deleted_at: null,
        created_by_device: expect.any(String),
        updated_by_device: expect.any(String),
      },
    ])
  })

  it('rend les valeurs par défaut pour une ligne supprimée, qu’un réglage rend de nouveau visible', async () => {
    await repository.update({ vaccineReminderTime: '07:45', remindBeforeDue: false })
    await db.run('UPDATE carnet_settings SET deleted_at = updated_at WHERE id = ?', [
      CARNET_SETTINGS_ID,
    ])

    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '09:00',
      remindBeforeDue: true,
    })

    await repository.update({ vaccineReminderTime: '08:30' })

    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '08:30',
      remindBeforeDue: true,
    })
    await expect(rows()).resolves.toMatchObject([{ deleted_at: null }])
  })

  it.each(['9h', '9:00', '24:00', '12:60'])(
    'refuse l’heure « %s » avant d’atteindre la base',
    async (vaccineReminderTime) => {
      await expect(repository.update({ vaccineReminderTime })).rejects.toThrow(ZodError)

      await expect(rows()).resolves.toEqual([])
    },
  )

  describe('export et import', () => {
    const IMPORTES = {
      vaccineReminderTime: '18:30',
      remindBeforeDue: false,
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
      createdByDevice: 'appareil-du-fichier',
      updatedByDevice: 'appareil-du-fichier',
    }
    const LATER = '2030-01-01T09:00:00.000Z'

    it('n’a ni ligne à exporter ni version tant que rien n’a été réglé', async () => {
      await expect(repository.getRecord()).resolves.toBeNull()
      await expect(repository.getVersion()).resolves.toBeNull()
    })

    it('écrit les réglages importés avec leurs dates d’origine, puis les relit', async () => {
      await db.runMany([repository.restoreStatement(IMPORTES)])

      await expect(repository.getRecord()).resolves.toEqual(IMPORTES)
      await expect(repository.get()).resolves.toEqual({
        vaccineReminderTime: '18:30',
        remindBeforeDue: false,
      })
      await expect(repository.getVersion()).resolves.toEqual({
        updatedAt: IMPORTES.updatedAt,
        deletedAt: null,
      })
    })

    it('écrase des réglages existants, même supprimés', async () => {
      await repository.update({ vaccineReminderTime: '07:00' })
      await db.runMany([repository.markDeletedStatement(LATER)])

      await db.runMany([repository.restoreStatement(IMPORTES)])

      await expect(repository.getRecord()).resolves.toEqual(IMPORTES)
      await expect(rows()).resolves.toHaveLength(1)
    })

    it('revient aux réglages par défaut une fois la ligne marquée supprimée, sans la perdre', async () => {
      await db.runMany([repository.restoreStatement(IMPORTES)])

      await db.runMany([repository.markDeletedStatement(LATER)])

      await expect(repository.getRecord()).resolves.toBeNull()
      await expect(repository.get()).resolves.toEqual({
        vaccineReminderTime: '09:00',
        remindBeforeDue: true,
      })
      await expect(repository.getVersion()).resolves.toEqual({
        updatedAt: LATER,
        deletedAt: LATER,
      })
    })

    it('refuse une heure que la base ne connaît pas', async () => {
      await expect(
        db.runMany([repository.restoreStatement({ ...IMPORTES, vaccineReminderTime: '24:00' })]),
      ).rejects.toThrow(/CHECK/)
    })
  })

  it('met le réglage en file d’envoi quand la synchronisation est active', async () => {
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')

    await repository.update({ remindBeforeDue: false })

    await expect(db.query('SELECT entity, entity_id FROM sync_outbox')).resolves.toEqual([
      { entity: 'carnet_settings', entity_id: CARNET_SETTINGS_ID },
    ])
  })
})

describe('getCarnetSettingsRepository', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
  })

  afterEach(() => {
    db.close()
  })

  it('ne met pas en cache une ouverture ratée, puis réutilise celle qui réussit', async () => {
    vi.mocked(getDb).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getCarnetSettingsRepository()).rejects.toThrow('base indisponible')

    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getCarnetSettingsRepository()
    await expect(repository.get()).resolves.toMatchObject({ remindBeforeDue: true })

    await expect(getCarnetSettingsRepository()).resolves.toBe(repository)
    expect(getDb).toHaveBeenCalledTimes(2)
  })
})
