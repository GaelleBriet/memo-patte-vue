// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { PHOTO_CLOUD_GRACE_MS } from '../service/cloud-photo'
import { MAX_SWEEP_DELETIONS, createCloudPhotoSweep } from '../service/cloud-photo-sweep'
import type { CloudPhotoObject } from '../service/photo-list-port'
import { createFakeOutbox, type FakeOutboxEntry } from './fake-sync-outbox'
import { fakeCloudAnimals, fakePhotoStorage, type CloudAnimal } from './fake-cloud-photos'

const USER = 'user-1'
const DAY_MS = 24 * 60 * 60 * 1000
const BASE = Date.parse('2026-10-28T10:00:00.000Z')

interface Campaign {
  name: string
  firstSeed: number
  scenarios: number
  photos: number
  /** Part des photos présentes dans le dossier. */
  objectShare: number
  maxAgeDays: number
  /** Nombre moyen de photos distinctes portées par les fiches du cloud, rapporté au nombre de photos. */
  referenceShare: number
  maxCloudRows: number
}

const CAMPAIGNS: Campaign[] = [
  {
    name: 'petits carnets',
    firstSeed: 1355,
    scenarios: 4000,
    photos: 16,
    objectShare: 0.6,
    maxAgeDays: 20,
    referenceShare: 0.5,
    maxCloudRows: 8,
  },
  {
    name: 'grands carnets',
    firstSeed: 900000,
    scenarios: 600,
    photos: 45,
    objectShare: 0.9,
    maxAgeDays: 60,
    referenceShare: 0.2,
    maxCloudRows: 1300,
  },
]

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scenario {
  serverNow: number
  objects: Array<CloudPhotoObject & { writtenAt: number }>
  cloud: CloudAnimal[]
  local: string[]
  outbox: FakeOutboxEntry[]
  phoneNow: Date
  failingDelete: string | null
  listFails: boolean
  /** Rang de la page des fiches du cloud qui échoue, ou `null`. */
  cloudFailsAtPage: number | null
  localFails: boolean
}

function scenario(seed: number, campaign: Campaign): Scenario {
  const random = mulberry32(seed)
  const int = (max: number) => Math.floor(random() * max)
  const pick = <T>(items: readonly T[]) => items[int(items.length)] as T
  const iso = (ms: number) => new Date(ms).toISOString()
  const pool = Array.from(
    { length: campaign.photos },
    (_, index) => `photo-${String(index).padStart(2, '0')}.jpg`,
  )

  const serverNow = BASE + int(60) * DAY_MS
  const age = () => Math.floor(random() * campaign.maxAgeDays * DAY_MS)
  const wholeDaysAgo = () => serverNow - int(campaign.maxAgeDays) * DAY_MS
  const objects = pool
    .filter(() => random() < campaign.objectShare)
    .map((name) => {
      const created = serverNow - age()
      const updated = random() < 0.2 ? Math.min(serverNow, created + age()) : created
      return { name, createdAt: iso(created), updatedAt: iso(updated), writtenAt: updated }
    })
  const rowCount = int(campaign.maxCloudRows + 1)
  const photoShare = Math.min(
    0.75,
    (campaign.referenceShare * campaign.photos) / Math.max(rowCount, 1),
  )
  const cloud = Array.from({ length: rowCount }, (_, index) => ({
    id: `animal-${String(int(100000)).padStart(5, '0')}-${index}`,
    photo_path: random() < photoShare ? pick(pool) : null,
    deleted_at: random() < 0.3 ? iso(serverNow - age()) : null,
    stamp: iso(random() < 0.3 ? serverNow : random() < 0.5 ? wholeDaysAgo() : serverNow - age()),
  }))
  const local = pool.filter(() => random() < 0.15)
  const outbox: FakeOutboxEntry[] = [
    ...(random() < 0.15
      ? [{ entity: 'animal', entityId: 'animal-0', queuedAt: iso(serverNow), attempts: 0 }]
      : []),
    ...pool
      .filter(() => random() < 0.08)
      .map((entityId) => ({
        entity: ANIMAL_PHOTO_ENTITY,
        entityId,
        queuedAt: iso(serverNow - age()),
        attempts: 0,
      })),
    ...(random() < 0.2
      ? [{ entity: 'weight_entry', entityId: 'pesee', queuedAt: iso(serverNow), attempts: 0 }]
      : []),
  ]
  return {
    serverNow,
    objects,
    cloud,
    local,
    outbox,
    phoneNow: new Date(serverNow + (int(121) - 60) * DAY_MS),
    failingDelete: random() < 0.1 ? pick(pool) : null,
    listFails: random() < 0.05,
    cloudFailsAtPage: random() < 0.05 ? int(3) : null,
    localFails: random() < 0.05,
  }
}

async function play(played: Scenario) {
  const storage = fakePhotoStorage(played.objects.map(({ writtenAt: _w, ...object }) => object))
  if (played.failingDelete !== null) {
    storage.failures.set(played.failingDelete, () => new Error('refus'))
  }
  if (played.listFails) storage.list.mockRejectedValue(new Error('réseau coupé'))
  const cloudAnimals = fakeCloudAnimals(played.cloud)
  const readPage = cloudAnimals.pullPage.getMockImplementation()
  let pageCalls = 0
  cloudAnimals.pullPage.mockImplementation(async (...args) => {
    if (pageCalls++ === played.cloudFailsAtPage) throw new Error('réseau coupé')
    if (!readPage) throw new Error('fausse table sans lecture')
    return readPage(...args)
  })
  const sweep = createCloudPhotoSweep({
    outbox: createFakeOutbox(played.outbox),
    cloudAnimals,
    localKeptPhotos: async () => {
      if (played.localFails) throw new Error('base illisible')
      return played.local
    },
    objects: storage,
    deletes: storage,
    isEligible: () => true,
    isAccountCurrent: (userId) => userId === USER,
    lastSweep: { read: () => null, write: () => {} },
    now: () => played.phoneNow,
  })
  await expect(sweep.sweep(USER)).resolves.toBeUndefined()
  return {
    cloudFailed: pageCalls > (played.cloudFailsAtPage ?? Infinity),
    deleted: storage.deleted,
  }
}

function violationsOf(played: Scenario, deleted: string[], cloudFailed: boolean): string[] {
  const violations: string[] = []
  const referenced = new Set([
    ...played.cloud.flatMap(({ photo_path }) => (photo_path === null ? [] : [photo_path])),
    ...played.local,
    ...played.outbox
      .filter(({ entity }) => entity === ANIMAL_PHOTO_ENTITY)
      .map(({ entityId }) => entityId),
  ])
  const writtenAt = new Map(played.objects.map(({ name, writtenAt: at }) => [name, at]))
  const animalPending = played.outbox.some(({ entity }) => entity === 'animal')
  const readFailed = played.listFails || played.localFails || cloudFailed

  for (const name of deleted) {
    if (referenced.has(name)) violations.push(`${name} effacée alors qu’une fiche la porte`)
    const age = played.serverNow - (writtenAt.get(name) ?? Number.POSITIVE_INFINITY)
    if (!(age >= PHOTO_CLOUD_GRACE_MS)) violations.push(`${name} effacée avant 7 jours`)
  }
  if (deleted.length > MAX_SWEEP_DELETIONS) violations.push(`${deleted.length} effacements`)
  if (animalPending && deleted.length > 0) {
    violations.push('effacement alors qu’une fiche attend d’être envoyée')
  }
  if (readFailed && deleted.length > 0) violations.push('effacement après une lecture ratée')

  const serverNowKnown = played.cloud.some(({ stamp }) => Date.parse(stamp) === played.serverNow)
  const unhindered =
    serverNowKnown && !readFailed && played.failingDelete === null && !animalPending
  if (unhindered) {
    const orphans = played.objects.filter(
      ({ name, writtenAt: at }) =>
        !referenced.has(name) && played.serverNow - at >= PHOTO_CLOUD_GRACE_MS,
    )
    const expectedCount = Math.min(orphans.length, MAX_SWEEP_DELETIONS)
    if (deleted.length !== expectedCount) {
      violations.push(`${expectedCount} orphelins à effacer, ${deleted.length} effacés`)
    }
    const youngestDeleted = Math.max(...deleted.map((name) => writtenAt.get(name) ?? 0))
    const olderLeft = orphans.filter(
      ({ name, writtenAt: at }) => !deleted.includes(name) && at < youngestDeleted,
    )
    if (olderLeft.length > 0) violations.push('un orphelin plus ancien est resté')
  }
  return violations
}

describe.each(CAMPAIGNS)('ménage des photos du cloud : $name tirés au hasard', (campaign) => {
  beforeAll(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it(`graines ${campaign.firstSeed} à ${campaign.firstSeed + campaign.scenarios - 1}`, async () => {
    const violations: string[] = []
    let sweptSomething = 0
    let capped = 0
    let paged = 0
    for (let seed = campaign.firstSeed; seed < campaign.firstSeed + campaign.scenarios; seed++) {
      const played = scenario(seed, campaign)
      const { deleted, cloudFailed } = await play(played)
      violations.push(
        ...violationsOf(played, deleted, cloudFailed).map((what) => `graine ${seed} : ${what}`),
      )
      if (deleted.length > 0) sweptSomething++
      if (deleted.length === MAX_SWEEP_DELETIONS) capped++
      if (played.cloud.length > 500) paged++
    }

    expect(violations).toEqual([])
    expect(sweptSomething).toBeGreaterThan(campaign.scenarios / 10)
    if (campaign.photos > MAX_SWEEP_DELETIONS) expect(capped).toBeGreaterThan(0)
    if (campaign.maxCloudRows > 500) expect(paged).toBeGreaterThan(campaign.scenarios / 3)
  })
})
