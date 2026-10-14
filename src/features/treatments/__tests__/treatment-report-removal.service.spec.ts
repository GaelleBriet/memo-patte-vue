// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createReplay, readingAfter, storedHistory, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'

describe('#835 : « Supprimer ce report » emporte le décalage ancré à son arrivée (décision du 2026-10-14)', () => {
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

  async function miloAdvancedToThe13th(): Promise<string> {
    replay.clock.day = '2026-10-02'
    replay.tick()
    await replay.treatments.create({
      id: ID,
      animalId: ANIMAL,
      name: 'Milbemax',
      type: 'deworming',
      settings: {
        startsOn: '2026-10-02',
        firstDueOn: '2026-10-02',
        endsOn: null,
        frequency: { value: 1, unit: 'week' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    for (const day of ['2026-10-02', '2026-10-09']) {
      replay.clock.day = day
      replay.tick()
      await replay.doses.apply(ID, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: ID, dueOn: day, dueTime: null },
          status: 'given',
          givenOn: day,
          shiftsFollowing: false,
        },
      })
    }
    replay.clock.day = '2026-10-12'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'move',
      due: { settingId: ID, dueOn: '2026-10-16', dueTime: null },
      to: '2026-10-13',
      shiftsFollowing: true,
    })
    const doses = (await storedHistory(replay.treatments, ID)).doses
    return doses.find(({ status }) => status === 'postponed')!.id
  }

  const upcoming = async () => (await readingAfter(replay, ID))?.[4]?.split(',').slice(0, 3)

  it('Milo, dose du 16 avancée au 13 avec la case, « Supprimer ce report » : 16, 23, 30, plus de décalage', async () => {
    const report = await miloAdvancedToThe13th()
    expect(await upcoming()).toEqual(['2026-10-13 ', '2026-10-20 ', '2026-10-27 '])
    replay.tick()
    await replay.doses.apply(ID, { kind: 'remove', lineId: report })

    expect(await upcoming()).toEqual(['2026-10-16 ', '2026-10-23 ', '2026-10-30 '])
    const statuses = (await storedHistory(replay.treatments, ID)).doses.map(({ status }) => status)
    expect(statuses).toEqual(['given', 'given'])
  })

  it('« Annuler » rend le report et son décalage : 13, 20, 27', async () => {
    const report = await miloAdvancedToThe13th()
    const before = await readingAfter(replay, ID)
    replay.tick()
    const applied = await replay.doses.apply(ID, { kind: 'remove', lineId: report })
    replay.tick()
    await replay.doses.undoBatch(ID, applied.undo)

    expect(await readingAfter(replay, ID)).toEqual(before)
  })
})
