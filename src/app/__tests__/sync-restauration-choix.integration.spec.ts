// @vitest-environment node
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installRestorePrompt } from '@/app/restore-prompt'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { keptChoiceSnapshot } from '@/core/sync/__tests__/kept-choice-snapshot'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { SYNC_ENTITY_ORDER } from '@/core/sync/repository/sync-entity-order'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createAccountRestore, type RestoreProgress } from '@/core/sync/service/account-restore'
import { createRestoreFlow } from '@/core/sync/service/restore-flow'
import { normalizeSyncTimestamps } from '@/core/sync/service/normalize-sync-timestamps'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import type { SyncRow } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createAccountBackupService } from '@/features/settings/service/account-backup.service'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const PHONE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TABLET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CARNET_ENTITIES = SYNC_ENTITY_ORDER.filter((entity) => entity !== 'device')

const Vide = { render: () => null }

const byId = (a: SyncRow, b: SyncRow) => String(a.id).localeCompare(String(b.id))

async function createPhone(
  server: FakeSyncServer,
  deviceId: string,
  db?: InMemoryDb,
  choiceSnapshot = keptChoiceSnapshot(),
) {
  const base = db ?? (await createInMemoryDb())
  await base.execute('PRAGMA foreign_keys = ON')
  const deps = { loadSupabaseClient: async () => server.client }
  const repositories = {
    animals: createAnimalsRepository(base, deps),
    vaccinations: createVaccinationsRepository(base, deps),
    vaccinationInjections: createVaccinationInjectionsRepository(base, deps),
    treatments: createTreatmentsRepository(base, deps),
    treatmentPeriods: createTreatmentPeriodsRepository(base, deps),
    treatmentDoses: createTreatmentDosesRepository(base, deps),
    weight: createWeightRepository(base, deps),
  }
  const device = createDeviceRepository(base, deps)
  const settings = createCarnetSettingsRepository(base, deps)
  const tables = [
    device,
    repositories.animals,
    repositories.vaccinations,
    repositories.vaccinationInjections,
    repositories.treatments,
    repositories.treatmentPeriods,
    repositories.treatmentDoses,
    repositories.weight,
    settings,
  ]
  const outbox = createLocalSyncOutbox(base)
  const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const eligible = { value: true }
  const account = { userId: USER_ID as string | null }
  const restore = createAccountRestore({
    db: base,
    outbox,
    tables,
    userId: () => account.userId,
    onRemindersOutdated,
    choiceSnapshot,
  })
  const backup = createAccountBackupService({
    outbox: () => outbox,
    tables: () => tables,
    animals: () => repositories.animals,
    restore,
    userId: () => account.userId,
  })
  const cycle = createSyncCycle({
    db: base,
    outbox,
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables,
    userId: () => USER_ID,
    isEligible: () => eligible.value,
  })

  async function rows(entity: string): Promise<SyncRow[]> {
    const table = tables.find((candidate) => candidate.entity === entity)!
    const ids = await base.query<{ id: string }>(`SELECT id FROM ${entity}`)
    const found = await Promise.all(ids.map(async ({ id }) => (await table.getRowForPush(id))!))
    return found.sort(byId)
  }

  return {
    register: () =>
      device.register({ id: deviceId, installedAt: '2026-10-01T07:00:00.000Z' }, 'Pixel 8'),
    db: base,
    repositories,
    settings,
    outbox,
    restore,
    backup,
    choiceSnapshot,
    eligible,
    account,
    onRemindersOutdated,
    rows,
    sync: () => cycle.runCycle(),
  }
}

type Phone = Awaited<ReturnType<typeof createPhone>>

describe('restauration avec un carnet sur le téléphone', () => {
  let server: FakeSyncServer
  let phone: Phone
  let tablet: Phone

  function serverRows(entity: string): SyncRow[] {
    return server
      .rows(entity)
      .map(({ user_id: _userId, server_updated_at: _stamp, ...row }) =>
        normalizeSyncTimestamps(row as SyncRow),
      )
      .sort(byId)
  }

  async function carnetOf(device: Phone): Promise<Record<string, SyncRow[]>> {
    const entries = await Promise.all(
      CARNET_ENTITIES.map(async (entity) => [entity, await device.rows(entity)] as const),
    )
    return Object.fromEntries(entries)
  }

  const serverCarnet = () =>
    Object.fromEntries(CARNET_ENTITIES.map((entity) => [entity, serverRows(entity)]))

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 8) })
    server = createFakeSyncServer()
    phone = await createPhone(server, PHONE_ID)
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db: phone.db,
      repositories: phone.repositories,
    })
    await phone.register()
    await phone.settings.update({ vaccineReminderTime: '18:30' })
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    vi.setSystemTime(Date.now() + 60_000)
    tablet = await createPhone(server, TABLET_ID)
    await tablet.register()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    phone.db.close()
    tablet.db.close()
  })

  describe('« Remplacer »', () => {
    it('le carnet du téléphone devient celui de la sauvegarde, effacé pour de bon, rappels reconstruits', async () => {
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })
      await tablet.settings.update({ vaccineReminderTime: '07:45' })

      await tablet.restore.start('replace')
      await tablet.restore.run()

      expect(await carnetOf(tablet)).toEqual(serverCarnet())
      await expect(
        tablet.db.query('SELECT id FROM animal WHERE id = ?', [pistache.id]),
      ).resolves.toEqual([])
      expect(tablet.onRemindersOutdated).toHaveBeenCalledOnce()
      await expect(tablet.outbox.isEnabled()).resolves.toBe(true)
      await expect(tablet.outbox.restoreMode()).resolves.toBeNull()
    })

    it('garde la liste des appareils et envoie la fiche de ce téléphone, sans rien renvoyer du carnet', async () => {
      await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })

      await tablet.restore.start('replace')
      await tablet.restore.run()
      await expect(tablet.outbox.listPending()).resolves.toEqual([
        expect.objectContaining({ entity: 'device', entityId: TABLET_ID }),
      ])
      await tablet.sync()

      expect(serverRows('animal').map(({ name }) => name)).not.toContain('Pistache')
      expect(serverRows('device').map(({ id }) => id)).toEqual([PHONE_ID, TABLET_ID])
      expect((await tablet.rows('device')).map(({ id }) => id)).toEqual([PHONE_ID, TABLET_ID])
    })

    it('coupé par le réseau pendant le téléchargement, rien n’est effacé ; la reprise refait tout', async () => {
      await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })
      server.cutPull('treatment_dose')
      await tablet.restore.start('replace')

      await expect(tablet.restore.run()).rejects.toBeDefined()

      expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
      await expect(tablet.outbox.restoreMode()).resolves.toBe('replace')
      await expect(tablet.outbox.isEnabled()).resolves.toBe(false)

      const relaunched = await createPhone(server, TABLET_ID, tablet.db, tablet.choiceSnapshot)
      await expect(relaunched.restore.run()).resolves.toBe('restored')

      expect(await carnetOf(tablet)).toEqual(serverCarnet())
    })

    it('une pesée notée entre le choix et la reprise : rien n’est effacé, l’écran repropose le choix', async () => {
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', name: 'home', component: Vide },
          { path: '/weight', name: 'weight', component: Vide },
          { path: '/restore', name: 'account-restore', component: Vide },
        ],
      })
      const flow = createRestoreFlow(tablet.restore)
      flow.onRetryCheck(async () => {
        const outcome = await tablet.backup.check()
        if (outcome.kind === 'backup-found') flow.offer(outcome.summary)
      })
      await router.push('/')
      const stopPrompt = installRestorePrompt(router, () => flow)
      const found = await tablet.backup.check()
      if (found.kind !== 'backup-found') throw new Error(`sauvegarde attendue : ${found.kind}`)
      flow.offer(found.summary)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.cutPull('treatment_dose')
      await expect(flow.choose('replace')).resolves.toBe(false)
      expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
      await router.replace('/')
      await router.push('/weight')
      vi.setSystemTime(Date.now() + 60_000)
      await tablet.repositories.weight.create({
        animalId: pistache.id,
        weightKg: 12,
        measuredOn: '2026-10-21',
      })

      await expect(flow.resume()).resolves.toBe(false)
      await flow.whenChecked()
      await flushPromises()

      expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
      expect((await tablet.rows('weight_entry')).map(({ weight_kg }) => weight_kg)).toEqual([12])
      await expect(tablet.outbox.restoreMode()).resolves.toBeNull()
      await expect(tablet.outbox.isEnabled()).resolves.toBe(false)
      expect(flow.state.value).toEqual({ step: 'choice', summary: found.summary })
      expect(tablet.onRemindersOutdated).not.toHaveBeenCalled()
      expect(router.currentRoute.value.name).toBe('weight')

      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
      stopPrompt()
    })

    it('une pesée corrigée sous la date de modification la plus récente : rien n’est remplacé', async () => {
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })
      const now = Date.now()
      const premiere = await tablet.repositories.weight.create({
        animalId: pistache.id,
        weightKg: 4,
        measuredOn: '2026-10-20',
      })
      vi.setSystemTime(now + 10 * 60_000)
      await tablet.repositories.weight.create({
        animalId: pistache.id,
        weightKg: 4.2,
        measuredOn: '2026-10-21',
      })
      vi.setSystemTime(now + 60_000)
      await tablet.restore.start('replace')

      vi.setSystemTime(now + 2 * 60_000)
      await tablet.repositories.weight.update(premiere.id, {
        weightKg: 4.1,
        measuredOn: '2026-10-20',
      })

      await expect(tablet.restore.run()).resolves.toBe('carnet-changed')
      expect((await tablet.rows('weight_entry')).map(({ weight_kg }) => weight_kg).sort()).toEqual([
        4.1, 4.2,
      ])
    })

    it('choix gardé avec une empreinte de l’ancien format : le choix est à refaire', async () => {
      await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })
      await tablet.restore.start('replace')
      const tables = await Promise.all(
        CARNET_ENTITIES.map(async (entity) => {
          const [row] = await tablet.db.query<{ rows: number; latest: string | null }>(
            `SELECT COUNT(*) AS rows, MAX(updated_at) AS latest FROM ${entity}`,
          )
          return `${entity}:${row!.rows}:${row!.latest ?? ''}`
        }),
      )
      tablet.choiceSnapshot.save(tables.join('|'))

      await expect(tablet.restore.run()).resolves.toBe('carnet-changed')
      expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
    })

    it('un réglage changé entre le choix et la reprise : rien n’est remplacé', async () => {
      await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })
      await tablet.settings.update({ vaccineReminderTime: '07:45' })
      await tablet.restore.start('replace')

      vi.setSystemTime(Date.now() + 60_000)
      await tablet.settings.update({ vaccineReminderTime: '06:15' })

      await expect(tablet.restore.run()).resolves.toBe('carnet-changed')
      await expect(tablet.settings.get()).resolves.toMatchObject({ vaccineReminderTime: '06:15' })
      expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
    })

    it('choix fait avant cette version, sans état du carnet gardé : le choix est à refaire', async () => {
      await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })
      await tablet.restore.start('replace')
      tablet.choiceSnapshot.clear()

      await expect(tablet.restore.run()).resolves.toBe('carnet-changed')
      expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
    })
  })

  describe('« Fusionner »', () => {
    it('le téléphone garde son carnet et reçoit celui du compte ; la synchro envoie le sien ensuite', async () => {
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })

      await tablet.restore.start('merge')
      await tablet.restore.run()
      await tablet.sync()
      await phone.sync()

      expect(await carnetOf(tablet)).toEqual(serverCarnet())
      expect(await carnetOf(phone)).toEqual(serverCarnet())
      expect(serverRows('animal').map(({ id }) => id)).toContain(pistache.id)
    })

    it('une pesée notée entre le choix et la reprise ne l’arrête pas : rien n’est effacé', async () => {
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })
      server.cutPull('treatment_dose')
      await tablet.restore.start('merge')
      await expect(tablet.restore.run()).rejects.toBeDefined()

      vi.setSystemTime(Date.now() + 60_000)
      const pesee = await tablet.repositories.weight.create({
        animalId: pistache.id,
        weightKg: 12,
        measuredOn: '2026-10-21',
      })
      const relaunched = await createPhone(server, TABLET_ID, tablet.db, tablet.choiceSnapshot)

      await expect(relaunched.restore.run()).resolves.toBe('restored')
      expect((await tablet.rows('weight_entry')).map(({ id }) => id)).toContain(pesee.id)
      expect(await tablet.rows('vaccination')).toEqual(serverRows('vaccination'))
      await expect(tablet.outbox.restoreMode()).resolves.toBeNull()
    })

    it('réglages : la modification la plus récente gagne', async () => {
      await tablet.settings.update({ vaccineReminderTime: '07:45' })

      await tablet.restore.start('merge')
      await tablet.restore.run()
      await tablet.sync()

      await expect(tablet.settings.get()).resolves.toMatchObject({ vaccineReminderTime: '07:45' })
      expect(serverRows('carnet_settings')).toEqual(await tablet.rows('carnet_settings'))
    })
  })

  describe('sans Plus actif sur ce téléphone', () => {
    it('la sauvegarde revient quand même, puis rien ne part tant que Plus n’est pas réactivé', async () => {
      tablet.eligible.value = false
      const pistache = await tablet.repositories.animals.create({
        name: 'Pistache',
        species: 'cat',
      })

      await tablet.restore.start('merge')
      await tablet.restore.run()
      await tablet.sync()

      expect((await tablet.rows('animal')).map(({ id }) => id)).toContain(pistache.id)
      expect(await tablet.rows('vaccination')).toEqual(serverRows('vaccination'))
      expect(serverRows('animal').map(({ id }) => id)).not.toContain(pistache.id)

      tablet.eligible.value = true
      await tablet.sync()

      expect(serverRows('animal').map(({ id }) => id)).toContain(pistache.id)
    })
  })

  it('suit la progression jusqu’au dernier élément de la sauvegarde', async () => {
    const seen: RestoreProgress[] = []
    tablet.restore.onProgress((progress) => seen.push(progress))
    const total = SYNC_ENTITY_ORDER.reduce((sum, entity) => sum + server.rows(entity).length, 0)

    await tablet.restore.start('merge')
    await tablet.restore.run()

    expect(seen[0]).toEqual({ done: 0, total })
    expect(seen.at(-1)).toEqual({ done: total, total })
    expect(seen.map(({ done }) => done)).toEqual(seen.map(({ done }) => done).sort((a, b) => a - b))
  })

  it('une seule restauration à la fois', async () => {
    await tablet.restore.start('merge')

    const first = tablet.restore.run()
    const second = tablet.restore.run()

    expect(second).toBe(first)
    await first
  })

  it('compte quitté pendant le téléchargement : rien n’est écrit', async () => {
    await tablet.repositories.animals.create({ name: 'Pistache', species: 'cat' })
    server.beforeNextPull('weight_entry', () => {
      tablet.account.userId = null
    })

    await tablet.restore.start('replace')
    await expect(tablet.restore.run()).resolves.toBe('nothing-to-restore')

    expect((await tablet.rows('animal')).map(({ name }) => name)).toEqual(['Pistache'])
  })

  it('sans compte, ne fait rien', async () => {
    await tablet.restore.start('merge')
    tablet.account.userId = null

    await expect(tablet.restore.run()).resolves.toBe('nothing-to-restore')

    await expect(tablet.repositories.animals.list()).resolves.toEqual([])
  })

  it('sans restauration choisie, ne fait rien', async () => {
    await expect(tablet.restore.run()).resolves.toBe('nothing-to-restore')

    await expect(tablet.repositories.animals.list()).resolves.toEqual([])
    await expect(tablet.outbox.isEnabled()).resolves.toBe(false)
  })
})
