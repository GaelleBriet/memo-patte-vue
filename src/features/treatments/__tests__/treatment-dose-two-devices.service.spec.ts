// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedHistory, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const OTHER = 'autre-appareil'

type OtherDevice = { id: string; status: 'given' | 'missed'; givenOn: string | null }
const GIVEN_ON_10: OtherDevice = { id: OTHER, status: 'given', givenOn: '2026-10-10' }

const markMissed = () =>
  ({
    kind: 'note',
    gesture: {
      kind: 'note',
      due: { settingId: ID, dueOn: '2026-10-10', dueTime: null },
      status: 'missed',
      givenOn: '2026-10-10',
      shiftsFollowing: false,
    },
  }) as const

describe('TR-25 : une dose notée sur deux appareils, « Supprimer » (2026-10-12), « Modifier » (2026-10-14) et « Marquer comme oubliée » (2026-10-17)', () => {
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

  // Par défaut, la ligne en vigueur : celle de cet appareil, plus récente que celle reçue de l'autre.
  async function miloNotedOnBothDevices(
    other: OtherDevice = GIVEN_ON_10,
    otherAt = '2026-12-31T00:00:00.000Z',
  ): Promise<string> {
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
       VALUES (?, ?, ?, ?, '2026-10-10', NULL, ?, ?, NULL, ?, ?, 'autre', 'autre')`,
      [other.id, ID, ID, ANIMAL, other.givenOn, other.status, otherAt, otherAt],
    )
    const doses = (await storedHistory(replay.treatments, ID)).doses
    return doses.find(({ id }) => id !== other.id)!.id
  }

  async function sheetLines(): Promise<Record<string, string>> {
    const reading = readTreatment(await storedHistory(replay.treatments, ID), replay.clock.day)
    return Object.fromEntries(
      reading!.view.history.map(({ line, effect }) => [
        line.id,
        `${line.status} ${line.givenOn ?? ''} ${effect.kind}`,
      ]),
    )
  }

  it('dose du 10 oct. de Milo notée sur chaque appareil, « Supprimer » : plus aucune ligne pour cette dose', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.tick()
    await replay.doses.apply(ID, { kind: 'remove', lineId: shown })

    expect((await storedHistory(replay.treatments, ID)).doses).toEqual([])
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

  it('#841 : dose du 10 oct. de Milo donnée sur chaque appareil, « Marquer comme oubliée » : « Oubliée », la prise de l’autre appareil reste, sans effet', async () => {
    const shown = await miloNotedOnBothDevices()
    replay.clock.day = '2026-10-12'
    replay.tick()
    await replay.doses.apply(ID, markMissed())

    expect(await sheetLines()).toEqual({
      [shown]: 'missed  covers',
      [OTHER]: 'given 2026-10-10 idle',
    })
  })

  it('#931 : dose du 10 oct. de Milo donnée ici le 10, puis sur l’autre appareil le 11, « Marquer comme oubliée » ici : la ligne de cet appareil devient « Oubliée », la prise du 11 reste, sans effet', async () => {
    const givenOn11: OtherDevice = { id: OTHER, status: 'given', givenOn: '2026-10-11' }
    const shown = await miloNotedOnBothDevices(givenOn11, '2027-01-01T00:00:02.500Z')
    replay.clock.day = '2026-10-12'
    replay.tick()
    await replay.doses.apply(ID, markMissed())

    expect(await sheetLines()).toEqual({
      [shown]: 'missed  covers',
      [OTHER]: 'given 2026-10-11 idle',
    })
  })

  describe('« Annuler » rend la fiche d’avant, même ligne en vigueur', () => {
    const others: [string, OtherDevice][] = [
      ['oubliée', { id: 'zzzz-autre', status: 'missed', givenOn: null }],
      ['oubliée', { id: '0000-autre', status: 'missed', givenOn: null }],
      ['donnée le 9', { id: 'zzzz-autre', status: 'given', givenOn: '2026-10-09' }],
      ['donnée le 9', { id: '0000-autre', status: 'given', givenOn: '2026-10-09' }],
      ['donnée le 10', { id: 'zzzz-autre', status: 'given', givenOn: '2026-10-10' }],
      ['donnée le 10', { id: '0000-autre', status: 'given', givenOn: '2026-10-10' }],
    ]
    const gestures = {
      'Modifier au 11': (lineId: string) =>
        ({ kind: 'redate', lineId, givenOn: '2026-10-11', shiftsFollowing: false }) as const,
      Supprimer: (lineId: string) => ({ kind: 'remove', lineId }) as const,
      'Marquer comme oubliée': () => markMissed(),
    }

    const otherAfter: Record<string, RegExp> = {
      'Modifier au 11': /^retirée$/,
      Supprimer: /^retirée$/,
      'Marquer comme oubliée': / idle$/,
    }

    for (const [label, gesture] of Object.entries(gestures)) {
      for (const [state, other] of others) {
        it(`dose du 10 oct. de Milo, ${state} sur l'autre appareil (${other.id}), « ${label} » puis « Annuler »`, async () => {
          const shown = await miloNotedOnBothDevices(other)
          replay.clock.day = '2026-10-12'
          replay.tick()
          const before = await sheetLines()
          replay.tick()
          const applied = await replay.doses.apply(ID, gesture(shown))
          const afterGesture = await sheetLines()
          replay.tick()
          await replay.doses.undoBatch(ID, applied.undo)

          expect(before[shown]).toMatch(/ covers$/)
          expect(afterGesture[other.id] ?? 'retirée').toMatch(otherAfter[label]!)
          expect(await sheetLines()).toEqual(before)
        })
      }
    }

    for (const [state, other] of others) {
      it(`#842 : dose du 10 oct. de Milo donnée ici, ${state} sur l'autre appareil (${other.id}), « Supprimer » la ligne grisée puis « Annuler »`, async () => {
        const shown = await miloNotedOnBothDevices(other)
        replay.clock.day = '2026-10-12'
        replay.tick()
        const before = await sheetLines()
        replay.tick()
        const applied = await replay.doses.apply(ID, { kind: 'remove', lineId: other.id })
        const afterGesture = await sheetLines()
        replay.tick()
        await replay.doses.undoBatch(ID, applied.undo)

        expect(before[other.id]).toMatch(/ idle$/)
        expect(afterGesture).toEqual({ [shown]: before[shown] })
        expect(await sheetLines()).toEqual(before)
      })
    }
  })
})
