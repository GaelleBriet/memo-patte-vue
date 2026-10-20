// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import type { TreatmentEditionInput } from '@/features/treatments/schema/treatment-form.schema'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createClockedPhone, type ClockedPhone as Phone } from './clocked-phone'

// #904 : lundi 19 octobre 2026, le téléphone A avance de 3 jours (il croit être jeudi 22), B est à
// l'heure. Le vermifuge de Luna, tous les 3 jours à 20 h dès le 25 octobre.

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
const EVERY_3_DAYS = { value: 3, unit: 'day' } as const

const clock = { now: 0 }

const at = (instant: string) => {
  clock.now = Date.parse(instant)
}

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Milbemax',
  type: 'deworming',
  frequency: EVERY_3_DAYS,
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  ...changes,
})

describe('#904 : une horloge en avance de 3 jours, deux téléphones, de la base à la fiche', () => {
  let server: FakeSyncServer
  let a: Phone
  let b: Phone
  let id: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    server = createFakeSyncServer({ now: () => clock.now })
    const loadClient = async () => server.client
    a = await createClockedPhone(
      await createInMemoryDb(),
      loadClient,
      clock,
      THREE_DAYS,
      '2026-10-22',
    )
    b = await createClockedPhone(await createInMemoryDb(), loadClient, clock, 0, '2026-10-19')

    at('2026-10-19T07:00:00.000Z')
    const luna = await a.onClock(() => a.animals.create({ name: 'Luna', species: 'cat' }))
    ;({ id } = await a.onClock(() =>
      a.plans.create({
        animalId: luna.id,
        name: 'Milbemax',
        type: 'deworming',
        firstDoseOn: '2026-10-25',
        frequency: EVERY_3_DAYS,
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

  async function stored(phone: Phone) {
    const treatment = await phone.treatments.getWithPeriods(id)
    if (treatment === null) throw new Error(`Traitement introuvable : ${id}`)
    return treatment
  }

  async function sheet(phone: Phone) {
    const view = readTreatment(await stored(phone), '2026-10-19')!.view
    return {
      next: view.upcoming({ limit: 2 }).map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`),
      report: view.history
        .filter(({ line }) => line.status === 'postponed')
        .map(({ line, effect }) => `${line.dueOn} → ${line.targetOn} ${effect.kind}`),
    }
  }

  async function report(phone: Phone, dueTime: string): Promise<void> {
    const setting = (await stored(phone)).periods.find(({ times }) => times.includes(dueTime))!
    await phone.onClock(() =>
      phone.doses.apply(id, {
        kind: 'move',
        due: { settingId: setting.id, dueOn: '2026-10-25', dueTime },
        to: '2026-10-26',
        shiftsFollowing: false,
      }),
    )
  }

  const rewriteOn = (phone: Phone, times: string[]) =>
    phone.onClock(() => phone.plans.update(id, edition({ times })))

  async function bothSynced() {
    await a.sync()
    await b.sync()
    await a.sync()
    const [onA, onB] = [await sheet(a), await sheet(b)]
    expect(onA).toEqual(onB)
    return onA
  }

  const dates = async (phone: Phone) =>
    (await stored(phone)).periods
      .map(({ createdAt, settingsWrittenAt }) => `${createdAt} ${settingsWrittenAt}`)
      .sort()

  describe('A a changé les heures à 10 h : le réglage de 8 h, créé ce jour-là, se réécrit sur place', () => {
    beforeEach(async () => {
      at('2026-10-19T08:00:00.000Z')
      await rewriteOn(a, ['08:00'])
      await a.sync()
      await b.sync()
    })

    it('B reporte à 10 h 03, A corrige les heures à 10 h 05 : les deux lisent le même calendrier', async () => {
      at('2026-10-19T08:03:00.000Z')
      await report(b, '08:00')
      await b.sync()
      at('2026-10-19T08:05:00.000Z')
      await rewriteOn(a, ['09:00'])

      // R10 : des heures changées ne battent pas un report, qui part par son rang (#939).
      at('2026-10-19T08:06:00.000Z')
      await expect(bothSynced()).resolves.toEqual({
        next: ['2026-10-26 08:00', '2026-10-28 09:00'],
        report: ['2026-10-25 → 2026-10-26 moves'],
      })
      const expected = [
        '2026-10-19T07:00:00.000Z 2026-10-19T07:00:00.000Z',
        '2026-10-19T08:00:00.000Z 2026-10-19T08:05:00.000Z',
      ]
      expect(await dates(a)).toEqual(expected)
      expect(await dates(b)).toEqual(expected)
    })

    it('un report puis un réglage dans un même envoi de A : la lecture de A ne change pas', async () => {
      at('2026-10-19T08:10:00.000Z')
      await report(a, '08:00')
      at('2026-10-19T08:12:00.000Z')
      await rewriteOn(a, ['09:00'])
      const beforeSync = await sheet(a)

      at('2026-10-19T08:20:00.000Z')
      await expect(bothSynced()).resolves.toEqual(beforeSync)
      expect(beforeSync.report).toEqual(['2026-10-25 → 2026-10-26 moves'])
    })

    it('un réglage puis un report dans un même envoi de A : le report, plus récent, tient', async () => {
      at('2026-10-19T08:10:00.000Z')
      await rewriteOn(a, ['09:00'])
      at('2026-10-19T08:12:00.000Z')
      await report(a, '09:00')
      const beforeSync = await sheet(a)

      at('2026-10-19T08:20:00.000Z')
      await expect(bothSynced()).resolves.toEqual(beforeSync)
      expect(beforeSync.report).toEqual(['2026-10-25 → 2026-10-26 moves'])
    })

    it('A réécrit encore deux fois : les dates de création ne reculent pas', async () => {
      at('2026-10-19T08:05:00.000Z')
      await rewriteOn(a, ['09:00'])
      await a.sync()
      at('2026-10-19T08:20:00.000Z')
      await rewriteOn(a, ['10:00'])
      await bothSynced()

      const expected = [
        '2026-10-19T07:00:00.000Z 2026-10-19T07:00:00.000Z',
        '2026-10-19T08:00:00.000Z 2026-10-19T08:20:00.000Z',
      ]
      expect(await dates(a)).toEqual(expected)
      expect(await dates(b)).toEqual(expected)
      expect(
        server
          .rows('treatment_period')
          .map(({ created_at }) => new Date(String(created_at)).toISOString())
          .sort(),
      ).toEqual(['2026-10-19T07:00:00.000Z', '2026-10-19T08:00:00.000Z'])
    })
  })

  it('B renomme à 11 h 30, A a renommé à 11 h et pousse à 11 h 40 : refusé, A reprend la ligne de B', async () => {
    at('2026-10-19T09:00:00.000Z')
    await a.onClock(() => a.plans.update(id, edition({ name: 'Milpro' })))
    at('2026-10-19T09:30:00.000Z')
    await b.onClock(() => b.plans.update(id, edition({ name: 'Drontal' })))
    await b.sync()

    at('2026-10-19T09:40:00.000Z')
    await a.sync()
    await b.sync()

    for (const phone of [a, b]) {
      await expect(stored(phone)).resolves.toMatchObject({
        name: 'Drontal',
        updatedAt: '2026-10-19T09:30:00.000Z',
      })
    }
    expect(server.rows('treatment').map(({ name }) => name)).toEqual(['Drontal'])
  })
})
