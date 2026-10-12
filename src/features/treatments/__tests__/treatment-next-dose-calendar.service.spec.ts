// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createReplay, readingAfter, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const TIMES = ['08:00', '14:00', '20:00']

describe('« Prochaine dose » à rythme gardé, sur un traitement à plusieurs heures', () => {
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

  async function moveNextDoseTo(day: string) {
    replay.tick()
    await replay.treatments.create({
      id: ID,
      animalId: ANIMAL,
      name: 'Test',
      type: 'medication',
      settings: {
        startsOn: '2026-03-02',
        firstDueOn: '2026-03-02',
        endsOn: null,
        frequency: { value: 1, unit: 'day' },
        times: TIMES,
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    replay.clock.day = '2026-03-05'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId: ID, dueOn: '2026-03-05', dueTime: '08:00' },
        status: 'given',
        givenOn: '2026-03-05',
        shiftsFollowing: false,
      },
    })
    replay.tick()
    await replay.plans.update(ID, {
      name: 'Test',
      type: 'medication',
      doseQuantity: null,
      doseUnit: null,
      frequency: { value: 1, unit: 'day' },
      times: TIMES,
      endsOn: null,
      nextDoseOn: day,
    })
    return readingAfter(replay, ID)
  }

  it('le jour choisi ne reçoit que les heures restantes de la journée déplacée (TR-9, Q21)', async () => {
    const read = await moveNextDoseTo('2026-03-07')
    expect(read?.[2]).toBe('2026-03-07 14:00')
  })

  // Le moteur ouvrant un réglage à cette date donne les trois heures du 7 mars : écart à trancher.
  it.fails(
    'le jour choisi reçoit toutes les heures, comme un réglage ouvert à cette date',
    async () => {
      const read = await moveNextDoseTo('2026-03-07')
      expect(read?.[2]).toBe('2026-03-07 08:00')
    },
  )
})
