// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  CARNET_SETTINGS_ID,
  createCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '../repository/carnet-settings.repository'

const T_OLD = '2026-01-01T00:00:00.000Z'
const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const PG_LOCAL = '2026-01-01T00:05:00.000+00:00'
const USER_ID = '99999999-9999-4999-8999-999999999999'

const LOCAL_ROW = {
  id: CARNET_SETTINGS_ID,
  vaccine_reminder_time: '18:30',
  remind_before_due: 0,
  created_at: T_LOCAL,
  updated_at: T_LOCAL,
  deleted_at: null,
  created_by_device: 'appareil-test',
  updated_by_device: 'appareil-test',
}

function remoteSettings(overrides: Record<string, string | number | null> = {}) {
  return {
    ...LOCAL_ROW,
    vaccine_reminder_time: '07:15',
    remind_before_due: 1,
    updated_at: T_NEW,
    ...overrides,
  }
}

describe('carnetSettingsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let server: FakeSyncServer
  let repository: CarnetSettingsRepository

  async function insertLocalRow() {
    await db.run(
      `INSERT INTO carnet_settings (id, vaccine_reminder_time, remind_before_due, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, '18:30', 0, ?, ?, 'appareil-test', 'appareil-test')`,
      [CARNET_SETTINGS_ID, T_LOCAL, T_LOCAL],
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    server = createFakeSyncServer()
    repository = createCarnetSettingsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
  })

  afterEach(() => {
    db.close()
  })

  it('getRowForPush renvoie la ligne des réglages, même supprimée logiquement', async () => {
    await insertLocalRow()
    await db.run('UPDATE carnet_settings SET deleted_at = ?', [T_NEW])

    await expect(repository.getRowForPush(CARNET_SETTINGS_ID)).resolves.toEqual({
      ...LOCAL_ROW,
      deleted_at: T_NEW,
      created_by_device: 'appareil-test',
      updated_by_device: 'appareil-test',
    })
  })

  it('getRowForPush renvoie null tant que rien n’est réglé', async () => {
    await expect(repository.getRowForPush(CARNET_SETTINGS_ID)).resolves.toBeNull()
  })

  it('reprend les réglages d’un autre appareil quand rien n’est réglé ici', async () => {
    await db.runMany([repository.applyRemoteRowStatement(remoteSettings())])

    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '07:15',
      remindBeforeDue: true,
    })
  })

  it("n'écrase pas des réglages locaux plus récents, ni à égalité d'horodatage", async () => {
    await insertLocalRow()

    await db.runMany([
      repository.applyRemoteRowStatement(remoteSettings({ updated_at: T_OLD })),
      repository.applyRemoteRowStatement(remoteSettings({ updated_at: T_LOCAL })),
    ])

    await expect(repository.get()).resolves.toEqual({
      vaccineReminderTime: '18:30',
      remindBeforeDue: false,
    })
  })

  it('remplace les réglages locaux par une version distante plus récente', async () => {
    await insertLocalRow()

    await db.runMany([repository.applyRemoteRowStatement(remoteSettings())])

    await expect(db.query('SELECT * FROM carnet_settings')).resolves.toEqual([remoteSettings()])
  })

  it('pushRow écrit la ligne sous le compte, que pullPage relit depuis son curseur', async () => {
    await insertLocalRow()

    await repository.pushRow(USER_ID, (await repository.getRowForPush(CARNET_SETTINGS_ID))!)
    const page = await repository.pullPage(USER_ID, T_OLD, 500)

    const [pushed] = server.rows('carnet_settings')
    expect(pushed).toMatchObject({ user_id: USER_ID, id: CARNET_SETTINGS_ID })
    expect(page).toEqual({
      rows: [{ ...LOCAL_ROW, created_at: PG_LOCAL, updated_at: PG_LOCAL }],
      cursor: pushed?.server_updated_at,
    })
    await expect(repository.pullPage('autre-compte', T_OLD, 500)).resolves.toEqual({
      rows: [],
      cursor: null,
    })
  })
})
