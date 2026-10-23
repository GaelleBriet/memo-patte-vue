// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createTreatmentRemovalService } from '../service/treatment-removal.service'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const ANIMAL = '11111111-1111-4111-8111-111111111111'
const EVERY_2_WEEKS: Frequency = { value: 2, unit: 'week' }
const EVERY_3_WEEKS: Frequency = { value: 3, unit: 'week' }
const VERMIFUGE = {
  name: 'Vermifuge',
  type: 'deworming',
  doseQuantity: null,
  doseUnit: null,
} as const

let db: InMemoryDb
let replay: Replay

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-04-04T08:00:00.000Z') })
  db = await createInMemoryDb()
  replay = await createReplay(db)
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

const at = (instant: string) => vi.setSystemTime(Date.parse(instant))

async function milo() {
  const id = crypto.randomUUID()
  await replay.treatments.create({
    id,
    animalId: ANIMAL,
    name: VERMIFUGE.name,
    type: VERMIFUGE.type,
    settings: {
      startsOn: '2026-04-04',
      firstDueOn: '2026-04-04',
      endsOn: null,
      frequency: EVERY_2_WEEKS,
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    },
  })
  replay.clock.day = '2026-04-04'
  const reading = async () =>
    readTreatment(await storedTreatment(replay.treatments, id), replay.clock.day)!.view
  const removal = createTreatmentRemovalService({
    treatments: replay.treatments,
    reminders: () => ({ reschedule: async () => {} }),
  })
  return {
    async give(dueOn: string) {
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: id, dueOn, dueTime: null },
          status: 'given',
          givenOn: dueOn,
          shiftsFollowing: false,
        },
      })
    },
    modify(frequency: Frequency, nextDoseOn: string | null, shiftsFollowing?: boolean) {
      return replay.plans.update(id, {
        ...VERMIFUGE,
        frequency,
        times: [],
        endsOn: null,
        nextDoseOn,
        ...(shiftsFollowing === undefined ? {} : { shiftsFollowing }),
      })
    },
    async removeThenUndo() {
      const deletedAt = await removal.remove(id)
      at('2026-04-06T09:05:30.000Z')
      await removal.restore(id, deletedAt)
    },
    async calendar() {
      const view = await reading()
      return {
        upcoming: view.upcoming({ limit: 4 }).map(({ dueOn }) => dueOn),
        reports: view.history
          .filter(({ line }) => line.status === 'postponed')
          .map(({ line, effect }) => `${line.dueOn} → ${line.targetOn} ${effect.kind}`),
      }
    },
  }
}

describe('#1188 : « Supprimer ce traitement » puis « Annuler » garde la décision de chaque ligne', () => {
  it('Milo, vermifuge toutes les 2 semaines depuis le 4 avril 2026 : le 6 avril, la dose du 18 passe au 28, le rythme passe à 3 semaines puis revient à 2 semaines au 10 avril ; après « Supprimer » puis « Annuler », pas de dose en plus le 28 avril, le report reste sans effet', async () => {
    const carnet = await milo()
    await carnet.give('2026-04-04')
    replay.clock.day = '2026-04-06'

    at('2026-04-06T09:02:00.000Z')
    await carnet.modify(EVERY_2_WEEKS, '2026-04-28', false)
    at('2026-04-06T09:03:00.000Z')
    await carnet.modify(EVERY_3_WEEKS, null)
    at('2026-04-06T09:04:00.000Z')
    await carnet.modify(EVERY_2_WEEKS, '2026-04-10')

    const before = await carnet.calendar()
    expect(before).toEqual({
      upcoming: ['2026-04-10', '2026-04-24', '2026-05-08', '2026-05-22'],
      reports: ['2026-04-18 → 2026-04-28 idle'],
    })

    at('2026-04-06T09:05:00.000Z')
    await carnet.removeThenUndo()

    expect(await carnet.calendar()).toEqual(before)
  })
})
