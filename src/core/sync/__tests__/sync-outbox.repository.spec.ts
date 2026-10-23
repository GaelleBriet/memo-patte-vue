// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import {
  createSyncOutboxRepository,
  SYNC_ENTITY_ORDER,
  type SyncOutboxRepository,
} from '../repository/sync-outbox.repository'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  insertCarnetSettings,
  insertTreatment,
  insertTreatmentDose,
  insertTreatmentPeriod,
  insertVaccination,
  insertVaccinationInjection,
  insertWeightEntry,
  outboxRows,
  setAnimalPhoto,
  touchAnimal,
} from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'
const SEPTEMBER_1 = '2026-09-01T08:00:00.000Z'
const OCTOBER_23_8AM = '2026-10-23T08:00:00.000Z'
const SETTINGS_ID = '00000000-0000-0000-0000-000000000000'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const PHOTO_PIRATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'

describe('syncOutboxRepository', () => {
  let db: InMemoryDb
  let repository: SyncOutboxRepository

  beforeEach(async () => {
    db = await createSyncTestDb()
    repository = createSyncOutboxRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  describe('isPhotoInCarnet', () => {
    it('vrai pour la photo d’un animal non supprimé', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)

      await expect(repository.isPhotoInCarnet(PHOTO_MILO)).resolves.toBe(true)
    })

    it('faux pour une photo retirée, remplacée ou inconnue', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, T2)

      await expect(repository.isPhotoInCarnet(PHOTO_MILO)).resolves.toBe(false)
      await setAnimalPhoto(db, ANIMAL_ID, null, T2)
      await expect(repository.isPhotoInCarnet(PHOTO_PIRATE)).resolves.toBe(false)
    })

    it('compare le nom à l’identique : `_` n’y vaut pas n’importe quel caractère', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', 'aXb.jpg')

      await expect(repository.isPhotoInCarnet('a_b.jpg')).resolves.toBe(false)
      await expect(repository.isPhotoInCarnet('aXb.jpg')).resolves.toBe(true)
    })

    it('faux pour la photo d’un animal supprimé', async () => {
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])

      await expect(repository.isPhotoInCarnet(PHOTO_PIRATE)).resolves.toBe(false)
    })
  })

  describe('isPhotoKeptByAnimal', () => {
    it('vrai pour la photo d’un animal non supprimé ou supprimé, qui peut revenir', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])

      await expect(repository.isPhotoKeptByAnimal(PHOTO_MILO)).resolves.toBe(true)
      await expect(repository.isPhotoKeptByAnimal(PHOTO_PIRATE)).resolves.toBe(true)
    })

    it('faux pour une photo remplacée, retirée ou inconnue', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, T2)

      await expect(repository.isPhotoKeptByAnimal(PHOTO_MILO)).resolves.toBe(false)
      await setAnimalPhoto(db, ANIMAL_ID, null, T2)
      await expect(repository.isPhotoKeptByAnimal(PHOTO_PIRATE)).resolves.toBe(false)
    })

    it('compare le nom à l’identique : `_` n’y vaut pas n’importe quel caractère', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', 'aXb.jpg')

      await expect(repository.isPhotoKeptByAnimal('a_b.jpg')).resolves.toBe(false)
    })
  })

  describe('listCarnetPhotos', () => {
    it('rend une fois chaque photo des animaux non supprimés, ni celle d’un animal supprimé ni une photo retirée', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'jumeau', T1, 'Milo bis', PHOTO_MILO)
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])
      await insertAnimal(db, 'sans-photo', T1, 'Luna')

      await expect(repository.listCarnetPhotos()).resolves.toEqual([PHOTO_MILO])
    })
  })

  describe('sync_state.enabled', () => {
    it('est désactivé par défaut', async () => {
      await expect(repository.isEnabled()).resolves.toBe(false)
    })

    it('active puis désactive la synchronisation', async () => {
      await repository.setEnabled(true)
      await expect(repository.isEnabled()).resolves.toBe(true)

      await repository.setEnabled(false)
      await expect(repository.isEnabled()).resolves.toBe(false)
    })
  })

  describe('curseur de pull par entité', () => {
    it('vaut null pour une entité jamais tirée', async () => {
      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
    })

    it('mémorise un curseur par entité, sans toucher aux autres', async () => {
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastPulledAt('vaccination_injection', T1)

      await expect(repository.getLastPulledAt('animal')).resolves.toBe(T2)
      await expect(repository.getLastPulledAt('vaccination_injection')).resolves.toBe(T1)
      await expect(repository.getLastPulledAt('treatment_dose')).resolves.toBeNull()
    })

    it('remplace le curseur déjà mémorisé d’une entité', async () => {
      await repository.setLastPulledAt('animal', T1)
      await repository.setLastPulledAt('animal', T2)

      await expect(repository.getLastPulledAt('animal')).resolves.toBe(T2)
    })

    it('oublie tous les curseurs : le prochain pull repart du début, données intactes', async () => {
      await insertAnimal(db, ANIMAL_ID, T1)
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastPulledAt('treatment_dose', T1)

      await repository.clearPullCursors()

      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
      await expect(repository.getLastPulledAt('treatment_dose')).resolves.toBeNull()
      await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: ANIMAL_ID }])
    })
  })

  describe('dernière synchronisation réussie', () => {
    it('vaut null tant qu’aucune synchronisation n’a abouti', async () => {
      await expect(repository.getLastSyncedAt()).resolves.toBeNull()
    })

    it('mémorise la date de la dernière synchronisation réussie', async () => {
      await repository.setLastSyncedAt(T1)
      await repository.setLastSyncedAt(T2)

      await expect(repository.getLastSyncedAt()).resolves.toBe(T2)
    })
  })

  describe('restauration choisie', () => {
    it('aucune par défaut', async () => {
      await expect(repository.restoreMode()).resolves.toBeNull()
    })

    it('garde « Fusionner » ou « Remplacer » sans activer la synchro', async () => {
      await repository.startRestore('replace')
      await expect(repository.restoreMode()).resolves.toBe('replace')

      await repository.startRestore('merge')
      await expect(repository.restoreMode()).resolves.toBe('merge')
      await expect(repository.isEnabled()).resolves.toBe(false)
    })

    it('« Fusionner » : tout le carnet du téléphone en file, photos comprises, la synchro activée au bout', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(T2) })
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await repository.setLastPulledAt('animal', T1)
      await repository.startRestore('merge')
      const { before, after } = repository.restoreStatements({
        mode: 'merge',
        cursors: [{ entity: 'animal', lastPulledAt: T2 }],
      })

      await db.runMany([...before, ...after])

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 0 },
        { entity: ANIMAL_PHOTO_ENTITY, entityId: PHOTO_MILO, queuedAt: T2, attempts: 0 },
      ])
      await expect(repository.getLastPulledAt('animal')).resolves.toBe(T2)
      await expect(repository.isEnabled()).resolves.toBe(true)
      await expect(repository.restoreMode()).resolves.toBeNull()
    })

    it('« Fusionner » le 23 octobre à 8 h, Milo modifié le 1er septembre : sa photo entre en file à 8 h, ses lignes gardent le 1er septembre', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(OCTOBER_23_8AM) })
      await insertAnimal(db, ANIMAL_ID, SEPTEMBER_1, 'Milo', PHOTO_MILO)
      await insertVaccination(db, 'v-1', ANIMAL_ID, SEPTEMBER_1)
      const { before, after } = repository.restoreStatements({ mode: 'merge', cursors: [] })

      await db.runMany([...before, ...after])

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: SEPTEMBER_1, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: SEPTEMBER_1, attempts: 0 },
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entityId: PHOTO_MILO,
          queuedAt: OCTOBER_23_8AM,
          attempts: 0,
        },
      ])
    })

    it('« Remplacer » : seule la fiche des appareils part en file, aucune photo', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo')
      await db.run('UPDATE sync_state SET enabled = 0 WHERE id = 1')
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_MILO, T2)
      await db.run(
        `INSERT INTO device (id, model, installed_at, created_at, updated_at, deleted_at)
         VALUES ('appareil-1', 'Pixel 8', ?, ?, ?, NULL)`,
        [T1, T1, T1],
      )
      await repository.startRestore('replace')
      const { before, after } = repository.restoreStatements({ mode: 'replace', cursors: [] })

      await db.runMany([...before, ...after])

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'device', entityId: 'appareil-1', queuedAt: T1, attempts: 0 },
      ])
      await expect(repository.isEnabled()).resolves.toBe(true)
      await expect(repository.restoreMode()).resolves.toBeNull()
    })

    it('« Remplacer » le 24 octobre : la photo de Milo remplacée le 23 garde son entrée, sa date et ses essais ; les lignes du carnet sortent de la file', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, SEPTEMBER_1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, OCTOBER_23_8AM)
      await repository.recordFailedPush({ entity: ANIMAL_PHOTO_ENTITY, entityId: PHOTO_MILO })
      await repository.startRestore('replace')
      const { before, after } = repository.restoreStatements({ mode: 'replace', cursors: [] })

      await db.runMany([...before, ...after])

      await expect(outboxRows(db)).resolves.toEqual([
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entity_id: PHOTO_MILO,
          queued_at: OCTOBER_23_8AM,
          attempts: 1,
        },
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entity_id: PHOTO_PIRATE,
          queued_at: OCTOBER_23_8AM,
          attempts: 0,
        },
      ])
    })
  })

  describe('restauration et dernière sauvegarde', () => {
    for (const mode of ['merge', 'replace'] as const) {
      it(`« ${mode === 'merge' ? 'Fusionner' : 'Remplacer'} » repart sans la dernière sauvegarde d’un autre compte`, async () => {
        await repository.setLastSyncedAt(T2)
        await repository.startRestore(mode)
        const { before, after } = repository.restoreStatements({ mode, cursors: [] })

        await db.runMany([...before, ...after])

        await expect(repository.getLastSyncedAt()).resolves.toBeNull()
      })
    }
  })

  describe('listPending', () => {
    it('renvoie une liste vide sans entrée', async () => {
      await expect(repository.listPending()).resolves.toEqual([])
    })

    it('rend chaque parent avant ses enfants (ordre des clés étrangères Postgres)', async () => {
      await enableSync(db)
      await insertCarnetSettings(db, SETTINGS_ID, T1)
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentPeriod(db, 'p-1', 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 'p-1', 't-1', ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)
      await db.run(
        `INSERT INTO device (id, model, installed_at, created_at, updated_at)
         VALUES ('appareil', NULL, ?, ?, ?)`,
        [T1, T1, T1],
      )

      const pending = await repository.listPending()

      expect(pending).toEqual([
        { entity: 'device', entityId: 'appareil', queuedAt: T1, attempts: 0 },
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: T1, attempts: 0 },
        { entity: 'vaccination_injection', entityId: 'i-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment', entityId: 't-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_period', entityId: 'p-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_dose', entityId: 'd-1', queuedAt: T1, attempts: 0 },
        { entity: 'weight_entry', entityId: 'w-1', queuedAt: T1, attempts: 0 },
        { entity: 'carnet_settings', entityId: SETTINGS_ID, queuedAt: T1, attempts: 0 },
      ])
      expect(pending.map((entry) => entry.entity)).toEqual(SYNC_ENTITY_ORDER)
    })

    it('rend après toutes les autres une entité sans rang', async () => {
      await enableSync(db)
      await db.run(
        `INSERT INTO sync_outbox (entity, entity_id, queued_at) VALUES ('table_inconnue', 'x-1', ?)`,
        [T1],
      )
      await insertCarnetSettings(db, SETTINGS_ID, T2)
      await insertAnimal(db, ANIMAL_ID, T2)

      const pending = await repository.listPending()

      expect(pending.map(({ entity }) => entity)).toEqual([
        'animal',
        'carnet_settings',
        'table_inconnue',
      ])
    })
  })

  describe('enableAndQueueWholeCarnet', () => {
    async function insertWholeCarnet(): Promise<void> {
      await db.run(
        `INSERT INTO device (id, model, installed_at, created_at, updated_at)
         VALUES ('appareil', NULL, ?, ?, ?)`,
        [T1, T1, T1],
      )
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'parti', T2, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])
      await insertAnimal(db, 'sans-photo', T1, 'Luna')
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentPeriod(db, 'p-1', 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 'p-1', 't-1', ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await insertCarnetSettings(db, SETTINGS_ID, T1)
    }

    it('active la synchronisation et met en file chaque ligne du carnet, supprimées comprises, et la photo de chaque animal non supprimé', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(OCTOBER_23_8AM) })
      await insertWholeCarnet()
      await expect(repository.listPending()).resolves.toEqual([])

      await repository.enableAndQueueWholeCarnet()

      await expect(repository.isEnabled()).resolves.toBe(true)
      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'device', entityId: 'appareil', queuedAt: T1, attempts: 0 },
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 0 },
        { entity: 'animal', entityId: 'sans-photo', queuedAt: T1, attempts: 0 },
        { entity: 'animal', entityId: 'parti', queuedAt: T2, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: T1, attempts: 0 },
        { entity: 'vaccination_injection', entityId: 'i-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment', entityId: 't-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_period', entityId: 'p-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_dose', entityId: 'd-1', queuedAt: T1, attempts: 0 },
        { entity: 'weight_entry', entityId: 'w-1', queuedAt: T1, attempts: 0 },
        { entity: 'carnet_settings', entityId: SETTINGS_ID, queuedAt: T1, attempts: 0 },
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entityId: PHOTO_MILO,
          queuedAt: OCTOBER_23_8AM,
          attempts: 0,
        },
      ])
    })

    it('Milo, modifié le 1er septembre, synchro activée le 23 octobre à 8 h : sa photo entre en file à 8 h, ses lignes gardent le 1er septembre', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(OCTOBER_23_8AM) })
      await insertAnimal(db, ANIMAL_ID, SEPTEMBER_1, 'Milo', PHOTO_MILO)
      await insertVaccination(db, 'v-1', ANIMAL_ID, SEPTEMBER_1)

      await repository.enableAndQueueWholeCarnet()

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: SEPTEMBER_1, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: SEPTEMBER_1, attempts: 0 },
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entityId: PHOTO_MILO,
          queuedAt: OCTOBER_23_8AM,
          attempts: 0,
        },
      ])
    })

    it('garde telle quelle la photo déjà en file, avec l’heure de sa modification et ses essais', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(OCTOBER_23_8AM) })
      await insertAnimal(db, ANIMAL_ID, SEPTEMBER_1, 'Milo', PHOTO_MILO)
      await db.run(
        `INSERT INTO sync_outbox (entity, entity_id, queued_at, attempts) VALUES (?, ?, ?, 2)`,
        [ANIMAL_PHOTO_ENTITY, PHOTO_MILO, T2],
      )

      await repository.enableAndQueueWholeCarnet()

      const pending = await repository.listPending()
      expect(pending.find(({ entityId }) => entityId === PHOTO_MILO)).toEqual({
        entity: ANIMAL_PHOTO_ENTITY,
        entityId: PHOTO_MILO,
        queuedAt: T2,
        attempts: 2,
      })
    })

    it('garde telle quelle une entrée déjà en file', async () => {
      await insertWholeCarnet()
      await db.run(
        `INSERT INTO sync_outbox (entity, entity_id, queued_at, attempts) VALUES ('animal', ?, ?, 3)`,
        [ANIMAL_ID, T2],
      )

      await repository.enableAndQueueWholeCarnet()

      const pending = await repository.listPending()
      expect(pending.find(({ entityId }) => entityId === ANIMAL_ID)).toEqual({
        entity: 'animal',
        entityId: ANIMAL_ID,
        queuedAt: T2,
        attempts: 3,
      })
    })

    it('fait repartir le pull du début pour chaque table, même après un autre compte', async () => {
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastPulledAt('treatment_dose', T2)

      await repository.enableAndQueueWholeCarnet()

      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
      await expect(repository.getLastPulledAt('treatment_dose')).resolves.toBeNull()
    })

    it('relancée, ne crée aucune entrée de plus', async () => {
      await insertWholeCarnet()
      await repository.enableAndQueueWholeCarnet()
      const first = await repository.listPending()

      await repository.enableAndQueueWholeCarnet()

      await expect(repository.listPending()).resolves.toEqual(first)
    })

    it('oublie la dernière sauvegarde d’un autre compte : la première sauvegarde de celui-ci commence', async () => {
      await repository.setLastSyncedAt(T2)

      await repository.enableAndQueueWholeCarnet()

      await expect(repository.getLastSyncedAt()).resolves.toBeNull()
    })
  })

  describe('compteurs de la première sauvegarde', () => {
    it('comptent zéro sur un carnet vide', async () => {
      await expect(repository.countWholeCarnet()).resolves.toBe(0)
      await expect(repository.countPending()).resolves.toBe(0)
    })

    it('le carnet compte exactement ce que l’activation met en file, supprimés et photos compris', async () => {
      await db.run(
        `INSERT INTO device (id, model, installed_at, created_at, updated_at)
         VALUES ('appareil', NULL, ?, ?, ?)`,
        [T1, T1, T1],
      )
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'parti', T2, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])
      await insertAnimal(db, 'jumeau', T1, 'Luna', PHOTO_MILO)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentPeriod(db, 'p-1', 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 'p-1', 't-1', ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await insertCarnetSettings(db, SETTINGS_ID, T1)

      await repository.enableAndQueueWholeCarnet()

      const queued = (await repository.listPending()).length
      expect(queued).toBe(12)
      await expect(repository.countWholeCarnet()).resolves.toBe(queued)
      await expect(repository.countPending()).resolves.toBe(queued)
    })

    it('Milo « 2 sur 2 », photo remplacée à 10 h 02 : l’effacement de l’ancienne photo ne compte pas, le restant ne dépasse pas le carnet', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await repository.enableAndQueueWholeCarnet()
      for (const entry of await repository.listPending()) await repository.removeIfUnchanged(entry)

      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, '2026-10-23T10:02:00.000Z')

      await expect(repository.listPending()).resolves.toHaveLength(3)
      await expect(repository.countWholeCarnet()).resolves.toBe(2)
      await expect(repository.countPending()).resolves.toBe(2)
    })

    it('la file se vide au fil des envois, le carnet ne bouge pas', async () => {
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await repository.enableAndQueueWholeCarnet()

      await repository.removeIfUnchanged({ entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1 })

      await expect(repository.countPending()).resolves.toBe(1)
      await expect(repository.countWholeCarnet()).resolves.toBe(2)
    })
  })

  describe('removeIfUnchanged', () => {
    it('supprime une entrée dont le queued_at relu est identique', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()

      await repository.removeIfUnchanged(entry!)

      await expect(repository.listPending()).resolves.toEqual([])
    })

    it("garde l'entrée si queued_at a changé depuis la lecture (modification arrivée pendant le push)", async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [staleEntry] = await repository.listPending()
      await touchAnimal(db, ANIMAL_ID, T2)

      await repository.removeIfUnchanged(staleEntry!)

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T2, attempts: 0 },
      ])
    })

    it('ne fait rien pour une entrée déjà retirée', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()
      await repository.removeIfUnchanged(entry!)

      await expect(repository.removeIfUnchanged(entry!)).resolves.toBeUndefined()
    })
  })

  describe('forgetAccount', () => {
    it('désactive la synchro, vide la file, les curseurs et la dernière sauvegarde, sans toucher aux données', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastSyncedAt(T2)

      await repository.forgetAccount()

      await expect(repository.isEnabled()).resolves.toBe(false)
      await expect(repository.listPending()).resolves.toEqual([])
      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
      await expect(repository.getLastSyncedAt()).resolves.toBeNull()
      await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: ANIMAL_ID }])
    })

    it('oublie aussi une restauration choisie pour ce compte', async () => {
      await repository.startRestore('replace')

      await repository.forgetAccount()

      await expect(repository.restoreMode()).resolves.toBeNull()
    })

    it('ne remet plus en file les modifications suivantes', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)

      await repository.forgetAccount()
      await touchAnimal(db, ANIMAL_ID, T2)

      await expect(repository.listPending()).resolves.toEqual([])
    })
  })

  describe('recordFailedPush', () => {
    it("compte un essai raté sur l'entrée, qui reste en file", async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()

      await repository.recordFailedPush(entry!)
      await repository.recordFailedPush(entry!)

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 2 },
      ])
    })

    it('ne touche pas aux autres entrées', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      const [animal] = await repository.listPending()

      await repository.recordFailedPush(animal!)

      const pending = await repository.listPending()
      expect(pending.map(({ entity, attempts }) => ({ entity, attempts }))).toEqual([
        { entity: 'animal', attempts: 1 },
        { entity: 'vaccination', attempts: 0 },
      ])
    })
  })

  describe('clear', () => {
    it('vide la file sans toucher aux données', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)

      await repository.clear()

      await expect(repository.listPending()).resolves.toEqual([])
      await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: ANIMAL_ID }])
    })
  })

  describe('table sync_outbox', () => {
    it('expose les colonnes attendues', async () => {
      const columns = await db.query<{ name: string; notnull: number; pk: number }>(
        'PRAGMA table_info(sync_outbox)',
      )
      expect(columns.map((column) => column.name)).toEqual([
        'entity',
        'entity_id',
        'queued_at',
        'attempts',
      ])
      expect(columns.find((column) => column.name === 'entity')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'entity_id')?.pk).toBe(2)
    })
  })

  describe('table sync_state', () => {
    it('porte une seule ligne, contrainte par CHECK (id = 1)', async () => {
      await expect(
        db.run('INSERT INTO sync_state (id, enabled, restoring) VALUES (2, 0, 0)'),
      ).rejects.toThrow(/CHECK constraint failed/)
    })
  })
})
