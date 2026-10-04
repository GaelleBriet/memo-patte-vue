// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { enableSync, outboxRows } from '@/core/sync/__tests__/sync-test-db'
import { createDeviceRepository, type DeviceRepository } from '../device.repository'

const PIXEL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TABLETTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INSTALLED = '2026-10-03T09:00:00.000Z'
const LATER = '2026-10-04T09:00:00.000Z'
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('deviceRepository', () => {
  let db: InMemoryDb
  let server: FakeSyncServer
  let repository: DeviceRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    server = createFakeSyncServer()
    repository = createDeviceRepository(db, {
      loadSupabaseClient: async () => server.client as SupabaseClient,
    })
  })

  afterEach(() => {
    db.close()
  })

  it('enregistre l’appareil avec son modèle et sa date d’installation', async () => {
    await repository.register({ id: PIXEL, installedAt: INSTALLED }, 'Pixel 8')

    await expect(repository.listRecords()).resolves.toEqual([
      {
        id: PIXEL,
        model: 'Pixel 8',
        installedAt: INSTALLED,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ])
  })

  it('n’enregistre l’appareil qu’une fois, sans changer sa date d’installation', async () => {
    await repository.register({ id: PIXEL, installedAt: INSTALLED }, 'Pixel 8')
    await repository.register({ id: PIXEL, installedAt: LATER }, 'Pixel 8')

    await expect(repository.listRecords()).resolves.toMatchObject([
      { id: PIXEL, installedAt: INSTALLED },
    ])
  })

  it('accepte un modèle inconnu', async () => {
    await repository.register({ id: PIXEL, installedAt: INSTALLED }, null)

    await expect(repository.listRecords()).resolves.toMatchObject([{ id: PIXEL, model: null }])
  })

  it('met l’appareil en file d’envoi quand la synchronisation est active', async () => {
    await enableSync(db)

    await repository.register({ id: PIXEL, installedAt: INSTALLED }, 'Pixel 8')

    await expect(outboxRows(db)).resolves.toMatchObject([{ entity: 'device', entity_id: PIXEL }])
  })

  describe('import', () => {
    it('ajoute un appareil d’un autre téléphone et garde ses dates', async () => {
      const tablette = {
        id: TABLETTE,
        model: 'Galaxy Tab S9',
        installedAt: INSTALLED,
        createdAt: INSTALLED,
        updatedAt: INSTALLED,
      }

      await db.runMany([repository.restoreStatement(tablette, false)])

      await expect(repository.listRecords()).resolves.toEqual([tablette])
      await expect(repository.listVersions()).resolves.toEqual([
        { id: TABLETTE, updatedAt: INSTALLED, deletedAt: null },
      ])
    })

    it('réécrit un appareil déjà connu', async () => {
      await repository.register({ id: PIXEL, installedAt: INSTALLED }, null)
      const pixel = {
        id: PIXEL,
        model: 'Pixel 8',
        installedAt: INSTALLED,
        createdAt: INSTALLED,
        updatedAt: LATER,
      }

      await db.runMany([repository.restoreStatement(pixel, true)])

      await expect(repository.listRecords()).resolves.toEqual([pixel])
    })
  })

  describe('port de synchronisation', () => {
    it('expose son entité', () => {
      expect(repository.entity).toBe('device')
    })

    it('pousse l’appareil puis le relit depuis le serveur', async () => {
      await repository.register({ id: PIXEL, installedAt: INSTALLED }, 'Pixel 8')
      const row = await repository.getRowForPush(PIXEL)

      await repository.pushRow(USER, row!)
      const page = await repository.pullPage(USER, '1970-01-01T00:00:00.000Z', 10)

      expect(server.rows('device')).toMatchObject([{ user_id: USER, id: PIXEL, model: 'Pixel 8' }])
      expect(page.rows).toMatchObject([{ id: PIXEL, model: 'Pixel 8' }])
      expect(page.cursor).not.toBeNull()
    })

    it('garde la version la plus récente entre l’appareil et le serveur', async () => {
      await repository.register({ id: PIXEL, installedAt: INSTALLED }, 'Pixel 8')
      const local = await repository.getRowForPush(PIXEL)

      await db.runMany([
        repository.applyRemoteRowStatement({
          ...local!,
          model: 'ancien',
          updated_at: '2000-01-01T00:00:00.000Z',
        }),
        repository.applyRemoteRowStatement({
          id: TABLETTE,
          model: 'Galaxy Tab S9',
          installed_at: INSTALLED,
          created_at: INSTALLED,
          updated_at: INSTALLED,
          deleted_at: null,
        }),
      ])

      await expect(repository.listRecords()).resolves.toMatchObject([
        { id: PIXEL, model: 'Pixel 8' },
        { id: TABLETTE, model: 'Galaxy Tab S9' },
      ])
    })
  })
})
