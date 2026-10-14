// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, readingAfter, storedHistory, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'

describe('#835 : « Supprimer ce report » emporte le décalage ancré à son arrivée, ou est refusé (décisions du 2026-10-14)', () => {
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

  describe('TR-25 : les reports et les décalages de la journée venus de l’autre appareil partent aussi (décision du 2026-10-14)', () => {
    type OtherLine = { id: string; status: 'postponed' | 'shift'; targetOn: string; at: string }
    const OLDER = '2026-12-31T00:00:00.000Z'
    const NEWER = '2027-06-01T00:00:00.000Z'

    async function received({ id, status, targetOn, at }: OtherLine) {
      await db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
           given_on, status, target_on, created_at, updated_at, created_by_device, updated_by_device)
         VALUES (?, ?, ?, ?, '2026-10-16', NULL, NULL, ?, ?, ?, ?, 'autre', 'autre')`,
        [id, ID, ID, ANIMAL, status, targetOn, at, at],
      )
    }

    async function sheet(): Promise<Record<string, string>> {
      const reading = readTreatment(await storedHistory(replay.treatments, ID), replay.clock.day)
      return Object.fromEntries(
        reading!.view.history.map(({ line, effect }) => [
          line.id,
          `${line.status} ${line.targetOn ?? ''} ${effect.kind}`,
        ]),
      )
    }

    const cases: [string, OtherLine[]][] = [
      [
        'décalage ancré au 14, plus ancien',
        [{ id: '0000-autre', status: 'shift', targetOn: '2026-10-14', at: OLDER }],
      ],
      [
        'décalage ancré au 13, plus ancien',
        [{ id: 'zzzz-autre', status: 'shift', targetOn: '2026-10-13', at: OLDER }],
      ],
      [
        'décalage ancré au 14, plus récent',
        [{ id: '0000-autre', status: 'shift', targetOn: '2026-10-14', at: NEWER }],
      ],
      [
        'même report et même décalage',
        [
          { id: '0000-autre', status: 'shift', targetOn: '2026-10-13', at: OLDER },
          { id: 'zzzz-autre', status: 'postponed', targetOn: '2026-10-13', at: OLDER },
        ],
      ],
    ]

    for (const [label, others] of cases) {
      it(`autre appareil : ${label} ; « Supprimer ce report » : 16, 23, 30, puis « Annuler » rend la fiche d’avant`, async () => {
        const report = await miloAdvancedToThe13th()
        for (const other of others) await received(other)
        const before = await sheet()
        replay.tick()
        const applied = await replay.doses.apply(ID, { kind: 'remove', lineId: report })

        expect(await upcoming()).toEqual(['2026-10-16 ', '2026-10-23 ', '2026-10-30 '])
        const statuses = (await storedHistory(replay.treatments, ID)).doses.map(
          ({ status }) => status,
        )
        expect(statuses).toEqual(['given', 'given'])
        replay.tick()
        await replay.doses.undoBatch(ID, applied.undo)
        expect(await sheet()).toEqual(before)
      })
    }
  })

  it('le 20, dose du 20 donnée ; le 21, « Supprimer ce report » est refusé et rien ne change : 13, 20, 27', async () => {
    const report = await miloAdvancedToThe13th()
    replay.clock.day = '2026-10-20'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId: ID, dueOn: '2026-10-20', dueTime: null },
        status: 'given',
        givenOn: '2026-10-20',
        shiftsFollowing: false,
      },
    })
    replay.clock.day = '2026-10-21'
    replay.tick()
    const before = await storedHistory(replay.treatments, ID)

    await expect(replay.doses.apply(ID, { kind: 'remove', lineId: report })).rejects.toThrow(
      'later-dose',
    )
    expect(await storedHistory(replay.treatments, ID)).toEqual(before)
  })
})
