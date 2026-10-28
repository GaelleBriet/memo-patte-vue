// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { PHOTO_CLOUD_GRACE_MS } from '../service/cloud-photo'
import { MAX_SWEEP_DELETIONS, createCloudPhotoSweep } from '../service/cloud-photo-sweep'
import type { CloudPhotoObject } from '../service/photo-list-port'
import { createFakeOutbox, type FakeOutboxEntry } from './fake-sync-outbox'
import { fakeCloudAnimals, fakePhotoStorage, type CloudAnimal } from './fake-cloud-photos'

const SCENARIOS = 4000
const FIRST_SEED = 1355
const USER = 'user-1'
const DAY_MS = 24 * 60 * 60 * 1000
const BASE = Date.parse('2026-10-28T10:00:00.000Z')
const POOL = Array.from({ length: 16 }, (_, index) => `photo-${String(index).padStart(2, '0')}.jpg`)

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
}

function scenario(seed: number): Scenario {
  const random = mulberry32(seed)
  const int = (max: number) => Math.floor(random() * max)
  const pick = <T>(items: readonly T[]) => items[int(items.length)] as T
  const iso = (ms: number) => new Date(ms).toISOString()

  const serverNow = BASE + int(60) * DAY_MS
  const age = () => Math.floor(random() * 20 * DAY_MS)
  const objects = POOL.filter(() => random() < 0.6).map((name) => {
    const created = serverNow - age()
    const updated = random() < 0.2 ? Math.min(serverNow, created + age()) : created
    return { name, createdAt: iso(created), updatedAt: iso(updated), writtenAt: updated }
  })
  const cloud = Array.from({ length: int(8) }, (_, index) => ({
    id: `animal-${index}`,
    photo_path: random() < 0.75 ? pick(POOL) : null,
    deleted_at: random() < 0.3 ? iso(serverNow - age()) : null,
    stamp: iso(random() < 0.3 ? serverNow : serverNow - age()),
  }))
  const local = POOL.filter(() => random() < 0.15)
  const outbox: FakeOutboxEntry[] = [
    ...(random() < 0.15
      ? [{ entity: 'animal', entityId: 'animal-0', queuedAt: iso(serverNow), attempts: 0 }]
      : []),
    ...POOL.filter(() => random() < 0.08).map((entityId) => ({
      entity: ANIMAL_PHOTO_ENTITY,
      entityId,
      queuedAt: iso(serverNow - age()),
      attempts: 0,
    })),
    ...(random() < 0.2
      ? [{ entity: 'weight_entry', entityId: 'pesee', queuedAt: iso(serverNow), attempts: 0 }]
      : []),
  ]
  const phoneNow = new Date(serverNow + (int(121) - 60) * DAY_MS)
  const failingDelete = random() < 0.1 ? pick(POOL) : null
  return {
    serverNow,
    objects,
    cloud,
    local,
    outbox,
    phoneNow,
    failingDelete,
    listFails: random() < 0.05,
  }
}

async function play(seed: number) {
  const played = scenario(seed)
  const storage = fakePhotoStorage(played.objects.map(({ writtenAt: _w, ...object }) => object))
  if (played.failingDelete !== null) {
    storage.failures.set(played.failingDelete, () => new Error('refus'))
  }
  if (played.listFails) storage.list.mockRejectedValue(new Error('réseau coupé'))
  const sweep = createCloudPhotoSweep({
    outbox: createFakeOutbox(played.outbox),
    cloudAnimals: fakeCloudAnimals(played.cloud),
    localKeptPhotos: async () => played.local,
    objects: storage,
    deletes: storage,
    isEligible: () => true,
    isAccountCurrent: (userId) => userId === USER,
    lastSweep: { read: () => null, write: () => {} },
    now: () => played.phoneNow,
  })
  await expect(sweep.sweep(USER)).resolves.toBeUndefined()
  return { played, deleted: storage.deleted }
}

function violationsOf(played: Scenario, deleted: string[]): string[] {
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

  for (const name of deleted) {
    if (referenced.has(name)) violations.push(`${name} effacée alors qu’une fiche la porte`)
    const age = played.serverNow - (writtenAt.get(name) ?? Number.POSITIVE_INFINITY)
    if (!(age >= PHOTO_CLOUD_GRACE_MS)) violations.push(`${name} effacée avant 7 jours`)
  }
  if (deleted.length > MAX_SWEEP_DELETIONS) violations.push(`${deleted.length} effacements`)
  if (animalPending && deleted.length > 0) {
    violations.push('effacement alors qu’une fiche attend d’être envoyée')
  }

  const serverNowKnown = played.cloud.some(({ stamp }) => Date.parse(stamp) === played.serverNow)
  const unhindered =
    serverNowKnown && !played.listFails && played.failingDelete === null && !animalPending
  if (unhindered) {
    const expected = played.objects
      .filter(
        ({ name, writtenAt: at }) =>
          !referenced.has(name) && played.serverNow - at >= PHOTO_CLOUD_GRACE_MS,
      )
      .map(({ name }) => name)
      .sort()
    const got = [...deleted].sort()
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      violations.push(`orphelins attendus ${expected.join(', ')}, effacés ${got.join(', ')}`)
    }
  }
  return violations
}

describe(`ménage des photos du cloud : ${SCENARIOS} carnets tirés au hasard`, () => {
  beforeAll(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it(`graines ${FIRST_SEED} à ${FIRST_SEED + SCENARIOS - 1}`, async () => {
    const violations: string[] = []
    let sweptSomething = 0
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SCENARIOS; seed++) {
      const { played, deleted } = await play(seed)
      violations.push(...violationsOf(played, deleted).map((what) => `graine ${seed} : ${what}`))
      if (deleted.length > 0) sweptSomething++
    }

    expect(violations).toEqual([])
    expect(sweptSomething).toBeGreaterThan(SCENARIOS / 10)
  })
})
