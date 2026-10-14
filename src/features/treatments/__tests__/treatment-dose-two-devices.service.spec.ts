// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createReplay, storedHistory, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'

describe('TR-25 : une dose notée sur deux appareils, « Supprimer » (2026-10-12) et « Modifier » (2026-10-14)', () => {
  let db: InMemoryDb
  let replay: Replay

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2027, 0, 1) })
    db = await createInMemoryDb()
    replay = await createReplay(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  // La ligne en vigueur : celle de cet appareil, plus récente que celle reçue de l'autre.
  async function miloNotedOnBothDevices(): Promise<string> {
    replay.clock.day = '2026-10-03'
    replay.tick()
    await replay.treatments.create({
      id: ID,
      animalId: ANIMAL,
      name: 'Milbemax',
      type: 'deworming',
      settings: {
        startsOn: '2026-10-03',
        firstDueOn: '2026-10-03',
        endsOn: null,
        frequency: { value: 1, unit: 'week' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    replay.clock.day = '2026-10-10'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId: ID, dueOn: '2026-10-10', dueTime: null },
        status: 'given',
        givenOn: '2026-10-10',
        shiftsFollowing: false,
      },
    })
    await db.run(
      `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
         given_on, status, target_on, created_at, updated_at, created_by_device, updated_by_device)
       VALUES ('autre-appareil', ?, ?, ?, '2026-10-10', NULL, '2026-10-10', 'given', NULL,
         '2026-12-31T00:00:00.000Z', '2026-12-31T00:00:00.000Z', 'autre', 'autre')`,
      [ID, ID, ANIMAL],
    )
    const doses = (await storedHistory(replay.treatments, ID)).doses
    return doses.find(({ id }) => id !== 'autre-appareil')!.id
  }

  it('dose du 10 oct. de Milo notée sur chaque appareil, « Supprimer » : plus aucune ligne pour cette dose', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.tick()
    await replay.doses.apply(ID, { kind: 'remove', lineId: shown })

    expect((await storedHistory(replay.treatments, ID)).doses).toEqual([])
  })

  it('« Annuler » rétablit les deux lignes', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.tick()
    const applied = await replay.doses.apply(ID, { kind: 'remove', lineId: shown })
    await replay.doses.undoBatch(ID, applied.undo)

    expect((await storedHistory(replay.treatments, ID)).doses).toHaveLength(2)
  })

  it('dose du 10 oct. de Milo notée sur chaque appareil, « Modifier » au 11 : une seule ligne, donnée le 11', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.clock.day = '2026-10-12'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'redate',
      lineId: shown,
      givenOn: '2026-10-11',
      shiftsFollowing: false,
    })

    expect((await storedHistory(replay.treatments, ID)).doses).toMatchObject([
      { id: shown, dueOn: '2026-10-10', givenOn: '2026-10-11', status: 'given' },
    ])
  })

  it('« Annuler » après « Modifier » rétablit les deux lignes au 10', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.clock.day = '2026-10-12'
    replay.tick()
    const applied = await replay.doses.apply(ID, {
      kind: 'redate',
      lineId: shown,
      givenOn: '2026-10-11',
      shiftsFollowing: false,
    })
    await replay.doses.undoBatch(ID, applied.undo)

    const doses = (await storedHistory(replay.treatments, ID)).doses
    expect(doses.map(({ givenOn }) => givenOn)).toEqual(['2026-10-10', '2026-10-10'])
  })
})
