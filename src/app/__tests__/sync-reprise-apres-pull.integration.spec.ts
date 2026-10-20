// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import type { TreatmentEditionInput } from '@/features/treatments/schema/treatment-form.schema'
import { createClockedPhone, type ClockedPhone as Phone } from './clocked-phone'

// #904 : lundi 19 octobre 2026, deux téléphones à l'heure ; le vermifuge de Luna tous les 3 jours à
// 20 h dès le 25. La ligne de décalage que le serveur garde pointe vers une période de B que A n'a
// pas encore tirée : A la reprend après le pull, jamais avant.

const clock = { now: 0 }
const at = (instant: string) => {
  clock.now = Date.parse(instant)
}

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Milbemax',
  type: 'deworming',
  frequency: { value: 3, unit: 'day' },
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  ...changes,
})

describe('#904 : la ligne gardée par le serveur se reprend après le pull', () => {
  let server: FakeSyncServer
  let a: Phone
  let b: Phone
  let id: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    server = createFakeSyncServer({ now: () => clock.now })
    const loadClient = async () => server.client
    a = await createClockedPhone(await createInMemoryDb(), loadClient, clock, 0, '2026-10-19')
    b = await createClockedPhone(await createInMemoryDb(), loadClient, clock, 0, '2026-10-19')
    at('2026-10-19T07:00:00.000Z')
    const luna = await a.onClock(() => a.animals.create({ name: 'Luna', species: 'cat' }))
    ;({ id } = await a.onClock(() =>
      a.plans.create({
        animalId: luna.id,
        name: 'Milbemax',
        type: 'deworming',
        firstDoseOn: '2026-10-25',
        frequency: { value: 3, unit: 'day' },
        times: ['20:00'],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      }),
    ))
    await a.sync()
    await b.sync()
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  const moveShifting = (phone: Phone, settingId: string, to: string) =>
    phone.onClock(() =>
      phone.doses.apply(id, {
        kind: 'move',
        due: { settingId, dueOn: '2026-10-25', dueTime: '20:00' },
        to,
        shiftsFollowing: true,
      }),
    )

  const lines = (phone: Phone) =>
    phone.db.query<{ id: string; period_id: string; updated_at: string }>(
      'SELECT id, period_id, updated_at FROM treatment_dose ORDER BY id',
    )

  it('B réécrit sous sa nouvelle période la ligne de décalage que A avait retouchée hors ligne', async () => {
    const first = (await a.treatments.getWithPeriods(id))!.periods[0]!.id
    at('2026-10-19T08:00:00.000Z')
    await moveShifting(a, first, '2026-10-26')
    await a.sync()
    await b.sync()
    at('2026-10-19T09:00:00.000Z')
    await moveShifting(a, first, '2026-10-27')
    at('2026-10-19T09:30:00.000Z')
    await b.onClock(() => b.plans.update(id, edition({ doseQuantity: 1, doseUnit: 'tablet' })))
    const latest = (await b.treatments.getWithPeriods(id))!.periods.at(-1)!.id
    await moveShifting(b, latest, '2026-10-28')
    await b.sync()

    at('2026-10-19T10:00:00.000Z')
    await expect(a.sync()).resolves.toBeUndefined()

    expect(await a.db.query('SELECT entity FROM sync_outbox')).toEqual([])
    expect(await lines(a)).toEqual(await lines(b))
  })
})
