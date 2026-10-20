// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { resolve } from '../logic/treatment-edition-change'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const WEEK: Frequency = { value: 1, unit: 'week' }
const ASKED = { name: 'Test', type: 'medication', doseQuantity: null, doseUnit: null } as const

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

async function luna(first: string, today: string) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn: null,
    frequency: WEEK,
    times: ['09:00'],
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  await replay.start({ input: { settings: [setting], lines: [], today } } as unknown as V2Walk, id)
  const stored = () => storedTreatment(replay.treatments, id)
  return {
    async proposed() {
      const { nextDose } = resolve(
        await stored(),
        null,
        { chosenOn: null, shiftsFollowing: true },
        today,
      )
      return { on: nextDose?.proposedOn, help: nextDose?.help?.kind }
    },
    async modify(nextDoseOn: string, doseQuantity: number | null = null) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        doseQuantity,
        doseUnit: doseQuantity === null ? null : 'tablet',
        frequency: WEEK,
        times: ['09:00'],
        endsOn: null,
        nextDoseOn,
      })
    },
    async carnet() {
      const treatment = await stored()
      const { view } = readTreatment(treatment, today)!
      return {
        periods: treatment.periods.length,
        current: view.currentDoses.map(({ dueOn }) => dueOn),
        unlogged: view.unloggedDoses.map(({ dueOn }) => dueOn),
      }
    },
  }
}

describe('« Prochaine dose » d’un réglage sans prise propose la première dose encore à donner (R9)', () => {
  // #1005 : le 13 est non renseignée, la fiche dit « Dose du jour 20 oct. ».
  it.each([['2026-10-13'], ['2026-10-06']])(
    'Luna, Milbemax chaque semaine à 9 h depuis le %s, rien noté ; le 20 octobre, « Modifier » propose le 20, pas une dose en retard',
    async (first) => {
      const milbemax = await luna(first, '2026-10-20')
      expect(await milbemax.proposed()).toEqual({ on: '2026-10-20', help: 'today' })
    },
  )

  it('Luna, depuis le 13 octobre, rien noté ; le 20, la date proposée passée telle quelle ne change pas le carnet', async () => {
    const milbemax = await luna('2026-10-13', '2026-10-20')
    const before = await milbemax.carnet()
    expect(before).toEqual({ periods: 1, current: ['2026-10-20'], unlogged: ['2026-10-13'] })
    await milbemax.modify('2026-10-20')
    expect(await milbemax.carnet()).toEqual(before)
    await milbemax.modify('2026-10-20', 1)
    expect(await milbemax.carnet()).toEqual(before)
  })
})
