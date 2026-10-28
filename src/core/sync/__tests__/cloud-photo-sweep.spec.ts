// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import {
  CLOUD_PHOTO_SWEEP_INTERVAL_MS,
  MAX_SWEEP_DELETIONS,
  createCloudPhotoSweep,
  type CloudPhotoSweepDependencies,
} from '../service/cloud-photo-sweep'
import type { CloudPhotoObject } from '../service/photo-list-port'
import { createFakeOutbox, type FakeOutboxEntry } from './fake-sync-outbox'
import { fakeCloudAnimals, fakePhotoStorage, type CloudAnimal } from './fake-cloud-photos'

const USER = 'user-1'
const DAY_MS = 24 * 60 * 60 * 1000
const SERVER_NOW = Date.parse('2026-10-28T10:00:00.000Z')
const PHONE_NOW = new Date('2026-10-28T10:00:00.000Z')

const iso = (ms: number) => new Date(ms).toISOString()
const daysAgo = (days: number) => iso(SERVER_NOW - days * DAY_MS)
const photo = (letter: string) => `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}.jpg`

const P1 = photo('a')
const P2 = photo('b')
const P3 = photo('c')

const object = (name: string, createdAt: string, updatedAt = createdAt): CloudPhotoObject => ({
  name,
  createdAt,
  updatedAt,
})

const cloudAnimal = (
  id: string,
  photoPath: string | null,
  stamp = iso(SERVER_NOW),
  deletedAt: string | null = null,
): CloudAnimal => ({ id, photo_path: photoPath, deleted_at: deletedAt, stamp })

function setup(
  options: {
    objects?: CloudPhotoObject[]
    cloud?: CloudAnimal[]
    local?: string[]
    outbox?: FakeOutboxEntry[]
    enabled?: boolean
    lastSweep?: string | null
    now?: Date
  } = {},
) {
  const storage = fakePhotoStorage(options.objects ?? [])
  const cloudAnimals = fakeCloudAnimals(options.cloud ?? [cloudAnimal('repere', null)])
  const outbox = createFakeOutbox(options.outbox ?? [], {}, options.enabled ?? true)
  const localKeptPhotos = vi.fn<() => Promise<string[]>>(async () => options.local ?? [])
  let lastSweep = options.lastSweep ?? null
  const state = { eligible: true, accountCurrent: true }
  const deps: CloudPhotoSweepDependencies = {
    outbox,
    cloudAnimals,
    localKeptPhotos,
    objects: storage,
    deletes: storage,
    isEligible: () => state.eligible,
    isAccountCurrent: (userId) => state.accountCurrent && userId === USER,
    lastSweep: {
      read: () => lastSweep,
      write: (at) => {
        lastSweep = at
      },
    },
    now: () => options.now ?? PHONE_NOW,
  }
  return {
    storage,
    cloudAnimals,
    outbox,
    localKeptPhotos,
    state,
    sweep: createCloudPhotoSweep(deps),
    lastSweep: () => lastSweep,
  }
}

describe('createCloudPhotoSweep', () => {
  let warn: MockInstance<typeof console.warn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('efface une photo de plus de 7 jours qu’aucune fiche ne porte', async () => {
    const { sweep, storage } = setup({
      objects: [object(P1, daysAgo(8)), object(P2, daysAgo(8))],
      cloud: [cloudAnimal('milo', P2)],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([P1])
  })

  it('garde une photo portée par une fiche du cloud, supprimée comprise', async () => {
    const { sweep, storage } = setup({
      objects: [object(P1, daysAgo(30)), object(P2, daysAgo(30))],
      cloud: [cloudAnimal('milo', P1), cloudAnimal('pirate', P2, iso(SERVER_NOW), daysAgo(20))],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([])
  })

  it('garde une photo portée par une fiche du téléphone, supprimée comprise', async () => {
    const { sweep, storage } = setup({
      objects: [object(P1, daysAgo(30))],
      local: [P1],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([])
  })

  it('garde une photo encore en file, à envoyer ou à effacer par la file', async () => {
    const { sweep, storage } = setup({
      objects: [object(P1, daysAgo(30))],
      outbox: [{ entity: ANIMAL_PHOTO_ENTITY, entityId: P1, queuedAt: daysAgo(30), attempts: 0 }],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([])
  })

  it('n’efface rien tant qu’une fiche d’animal attend d’être envoyée', async () => {
    const { sweep, storage, cloudAnimals } = setup({
      objects: [object(P1, daysAgo(30))],
      outbox: [{ entity: 'animal', entityId: 'milo', queuedAt: daysAgo(0), attempts: 0 }],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([])
    expect(cloudAnimals.pullPage).not.toHaveBeenCalled()
  })

  it('n’efface rien si une fiche d’animal se met en file pendant les lectures', async () => {
    const { sweep, storage, outbox } = setup({ objects: [object(P1, daysAgo(30))] })
    vi.spyOn(outbox, 'listPending')
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { entity: 'animal', entityId: 'milo', queuedAt: daysAgo(0), attempts: 0 },
      ])

    await sweep.sweep(USER)

    expect(storage.list).toHaveBeenCalled()
    expect(storage.deleted).toEqual([])
  })

  describe('âge lu sur les dates du serveur', () => {
    it('garde la photo qu’un autre appareil vient d’envoyer, même avec l’horloge du téléphone en avance d’un mois', async () => {
      const { sweep, storage } = setup({
        objects: [object(P1, daysAgo(1)), object(P2, daysAgo(10))],
        now: new Date(SERVER_NOW + 30 * DAY_MS),
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([P2])
    })

    it('mesure l’âge depuis la dernière écriture du fichier sur le serveur', async () => {
      const { sweep, storage } = setup({
        objects: [object(P1, daysAgo(40), daysAgo(2))],
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([])
    })

    it('ne compte jamais au-delà de la date la plus récente lue sur le serveur', async () => {
      const { sweep, storage } = setup({
        objects: [object(P1, daysAgo(10))],
        cloud: [cloudAnimal('milo', null, daysAgo(5))],
        now: new Date(SERVER_NOW + 365 * DAY_MS),
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([])
    })

    it('efface à 7 jours tout juste', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, iso(SERVER_NOW - 7 * DAY_MS))] })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([P1])
    })

    it('garde un fichier sans date ou à la date illisible', async () => {
      const { sweep, storage } = setup({
        objects: [
          { name: P1, createdAt: null, updatedAt: null },
          { name: P2, createdAt: 'pas une date', updatedAt: null },
          { name: P3, createdAt: daysAgo(30), updatedAt: 'pas une date' },
        ],
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([])
    })
  })

  it('ne touche qu’aux fichiers nommés comme une photo du carnet', async () => {
    const { sweep, storage } = setup({
      objects: [
        object('.emptyFolderPlaceholder', daysAgo(30)),
        object('ancienne.webp', daysAgo(30)),
        object('a/b.jpg', daysAgo(30)),
        object(P1, daysAgo(30)),
      ],
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([P1])
  })

  it('lit toutes les fiches du cloud, page après page', async () => {
    const cloud = Array.from({ length: 1234 }, (_, index) =>
      cloudAnimal(`animal-${String(index).padStart(5, '0')}`, null, daysAgo(index % 3)),
    )
    cloud.push(cloudAnimal('zz-dernier', P1, daysAgo(2)))
    const { sweep, storage, cloudAnimals } = setup({
      objects: [object(P1, daysAgo(30)), object(P2, daysAgo(30))],
      cloud,
    })

    await sweep.sweep(USER)

    expect(storage.deleted).toEqual([P2])
    expect(cloudAnimals.pullPage.mock.calls.length).toBeGreaterThan(1)
  })

  it(`efface au plus ${MAX_SWEEP_DELETIONS} photos par passage, les plus anciennes d’abord`, async () => {
    const objects = Array.from({ length: MAX_SWEEP_DELETIONS + 5 }, (_, index) =>
      object(`orphelin-${String(index).padStart(3, '0')}.jpg`, daysAgo(8 + index)),
    )
    const { sweep, storage } = setup({ objects })

    await sweep.sweep(USER)

    expect(storage.deleted).toHaveLength(MAX_SWEEP_DELETIONS)
    expect(storage.deleted[0]).toBe(objects.at(-1)?.name)
    expect(storage.deleted).not.toContain(objects[0]?.name)
  })

  describe('Plus actif seulement', () => {
    it('ne lit ni n’efface rien sans Plus actif (abonnement échu compris)', async () => {
      const { sweep, storage, state, cloudAnimals } = setup({ objects: [object(P1, daysAgo(30))] })
      state.eligible = false

      await sweep.sweep(USER)

      expect(storage.list).not.toHaveBeenCalled()
      expect(cloudAnimals.pullPage).not.toHaveBeenCalled()
      expect(storage.deleted).toEqual([])
    })

    it('ne fait rien quand la synchro est en pause', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))], enabled: false })

      await sweep.sweep(USER)

      expect(storage.list).not.toHaveBeenCalled()
    })

    it('s’arrête si Plus prend fin pendant le passage', async () => {
      const { sweep, storage, state } = setup({
        objects: [object(P1, daysAgo(30)), object(P2, daysAgo(31))],
      })
      storage.onDelete = () => {
        state.eligible = false
      }

      await sweep.sweep(USER)

      expect(storage.deleted).toHaveLength(1)
    })

    it('s’arrête si le compte change pendant le passage', async () => {
      const { sweep, storage, state } = setup({
        objects: [object(P1, daysAgo(30)), object(P2, daysAgo(31))],
      })
      storage.onDelete = () => {
        state.accountCurrent = false
      }

      await sweep.sweep(USER)

      expect(storage.deleted).toHaveLength(1)
    })

    it('ne fait rien pour un autre compte que celui connecté', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))] })

      await sweep.sweep('user-2')

      expect(storage.list).not.toHaveBeenCalled()
    })
  })

  describe('une lecture qui échoue n’efface rien', () => {
    it.each([
      ['la file d’envoi', 'outbox'],
      ['les fiches du téléphone', 'local'],
      ['les fiches du cloud', 'cloud'],
      ['le dossier du cloud', 'list'],
    ] as const)('%s', async (_label, failing) => {
      const { sweep, storage, outbox, cloudAnimals, localKeptPhotos } = setup({
        objects: [object(P1, daysAgo(30))],
      })
      const failure = new Error('réseau coupé')
      if (failing === 'outbox') vi.spyOn(outbox, 'listPending').mockRejectedValue(failure)
      if (failing === 'local') localKeptPhotos.mockRejectedValue(failure)
      if (failing === 'cloud') cloudAnimals.pullPage.mockRejectedValue(failure)
      if (failing === 'list') storage.list.mockRejectedValue(failure)

      await expect(sweep.sweep(USER)).resolves.toBeUndefined()

      expect(storage.deleted).toEqual([])
    })
  })

  describe('une fois par connexion et par jour', () => {
    it('ne repasse pas une seconde fois dans le même lancement', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))] })

      await sweep.sweep(USER)
      await sweep.sweep(USER)

      expect(storage.list).toHaveBeenCalledTimes(1)
    })

    it('ne repasse pas dans le même lancement après une lecture ratée', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))] })
      storage.list.mockRejectedValueOnce(new Error('réseau coupé'))

      await sweep.sweep(USER)
      await sweep.sweep(USER)

      expect(storage.list).toHaveBeenCalledTimes(1)
    })

    it('ne repasse pas moins d’un jour après le dernier passage, même au lancement suivant', async () => {
      const recent = iso(PHONE_NOW.getTime() - CLOUD_PHOTO_SWEEP_INTERVAL_MS + 60_000)
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))], lastSweep: recent })

      await sweep.sweep(USER)

      expect(storage.list).not.toHaveBeenCalled()
    })

    it('repasse un jour après, et retient l’heure du passage', async () => {
      const dayBefore = iso(PHONE_NOW.getTime() - CLOUD_PHOTO_SWEEP_INTERVAL_MS)
      const { sweep, storage, lastSweep } = setup({
        objects: [object(P1, daysAgo(30))],
        lastSweep: dayBefore,
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([P1])
      expect(lastSweep()).toBe(PHONE_NOW.toISOString())
    })

    it('repasse si le dernier passage retenu est dans le futur (horloge revenue en arrière)', async () => {
      const { sweep, storage } = setup({
        objects: [object(P1, daysAgo(30))],
        lastSweep: iso(PHONE_NOW.getTime() + 3 * DAY_MS),
      })

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([P1])
    })

    it('ne retient pas le passage quand une lecture échoue : le lancement suivant réessaie', async () => {
      const { sweep, storage, lastSweep } = setup({ objects: [object(P1, daysAgo(30))] })
      storage.list.mockRejectedValueOnce(new Error('réseau coupé'))

      await sweep.sweep(USER)

      expect(lastSweep()).toBeNull()
    })
  })

  describe('journal', () => {
    it('un effacement raté arrête le passage, sans nom de fichier ni identifiant dans le journal', async () => {
      const { sweep, storage } = setup({
        objects: [object(P1, daysAgo(30)), object(P2, daysAgo(31))],
      })
      storage.failures.set(P2, () => new Error(`refus pour ${USER}/${P2}`))

      await sweep.sweep(USER)

      expect(storage.deleted).toEqual([])
      expect(warn).toHaveBeenCalledTimes(1)
      const logged = JSON.stringify(warn.mock.calls)
      expect(logged).not.toContain(P2)
      expect(logged).not.toContain(USER)
    })

    it('une lecture ratée se journalise sans nom de fichier ni identifiant', async () => {
      const { sweep, storage } = setup({ objects: [object(P1, daysAgo(30))] })
      storage.list.mockRejectedValue(new Error(`dossier ${USER} illisible`))

      await sweep.sweep(USER)

      expect(warn).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(warn.mock.calls)).not.toContain(USER)
    })
  })
})
