// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import type { TreatmentEditionInput } from '@/features/treatments/schema/treatment-form.schema'
import { createClockedPhone, type ClockedPhone as Phone } from './clocked-phone'

// #904 : Milo, tous les 3 jours à 20 h depuis le 1er mars 2026, créé par B à l'heure. Le téléphone
// A avance de 3 jours : lundi 9 mars 8 h réelles, il croit être jeudi 12.

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
const EVERY_2_DAYS = { value: 2, unit: 'day' } as const
const clock = { now: 0 }
const at = (instant: string) => {
  clock.now = Date.parse(instant)
}

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Milbemax',
  type: 'deworming',
  frequency: EVERY_2_DAYS,
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  pastDues: 'keep',
  ...changes,
})

describe('#904 : dates de grille, deux téléphones, une horloge en avance de 3 jours', () => {
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
      '2026-03-01',
    )
    b = await createClockedPhone(await createInMemoryDb(), loadClient, clock, 0, '2026-03-01')

    at('2026-03-01T07:00:00.000Z')
    const milo = await b.onClock(() => b.animals.create({ name: 'Milo', species: 'dog' }))
    ;({ id } = await b.onClock(() =>
      b.plans.create({
        animalId: milo.id,
        name: 'Milbemax',
        type: 'deworming',
        firstDoseOn: '2026-03-01',
        frequency: { value: 3, unit: 'day' },
        times: ['20:00'],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      }),
    ))
    await b.sync()
    await a.sync()
    a.calendar.day = '2026-03-12'
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  async function editOnA(instant: string, changes: Partial<TreatmentEditionInput>) {
    at(instant)
    await a.onClock(() => a.plans.update(id, edition(changes)))
  }

  /** A passe à « tous les 2 jours » à 8 h, puis à 21 h à 8 h 05 : P2, créée le jour même, se réécrit. */
  async function twoDaysThenNinePm() {
    await editOnA('2026-03-09T08:00:00.000Z', {})
    await editOnA('2026-03-09T08:05:00.000Z', { times: ['21:00'] })
  }

  async function latest(phone: Phone) {
    const treatment = await phone.treatments.getWithPeriods(id)
    const [period] = [...treatment!.periods].sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    return {
      createdAt: period!.createdAt,
      gridWrittenAt: period!.gridWrittenAt,
      gridBeforeWrittenAt: period!.gridBefore?.writtenAt ?? null,
    }
  }

  it('A pousse : sa période recule de 3 jours, la date de grille de P1, déjà juste, ne bouge pas', async () => {
    await twoDaysThenNinePm()
    const gridBeforeOnA = (await a.db.query<{ grid_before: string }>(
      'SELECT grid_before FROM treatment_period WHERE grid_before IS NOT NULL',
    )) as [{ grid_before: string }]

    await a.sync()
    await b.sync()

    const expected = {
      createdAt: '2026-03-09T08:00:00.000Z',
      gridWrittenAt: '2026-03-09T08:00:00.000Z',
      gridBeforeWrittenAt: '2026-03-01T07:00:00.000Z',
    }
    await expect(latest(a)).resolves.toEqual(expected)
    await expect(latest(b)).resolves.toEqual(expected)
    expect(
      server
        .rows('treatment_period')
        .flatMap(({ grid_before }) => (grid_before ? [grid_before] : [])),
    ).toEqual([gridBeforeOnA[0].grid_before])
  })

  async function gridDates(phone: Phone) {
    const treatment = await phone.treatments.getWithPeriods(id)
    return treatment!.periods
      .flatMap(({ gridWrittenAt, gridBefore }) => [gridWrittenAt, gridBefore?.writtenAt ?? null])
      .filter((date): date is string => date !== null)
      .sort()
  }

  it.each<[string, Partial<TreatmentEditionInput>, Partial<TreatmentEditionInput>]>([
    [
      'passe à « tous les 2 jours », synchronise, puis remet « tous les 3 jours »',
      {},
      { frequency: { value: 3, unit: 'day' } },
    ],
    [
      'ouvre une période qui hérite (21 h), synchronise, puis passe à « tous les 2 jours »',
      { frequency: { value: 3, unit: 'day' }, times: ['21:00'] },
      { times: ['21:00'] },
    ],
  ])(
    'A %s le 9 mars : aucune date de grille ne recule avant le 1er mars',
    async (_label, first, second) => {
      await editOnA('2026-03-09T08:00:00.000Z', first)
      await a.sync()
      await editOnA('2026-03-09T08:05:00.000Z', second)
      await a.sync()
      await b.sync()

      const dates = await gridDates(a)
      expect(dates[0]! >= '2026-03-01T07:00:00.000Z').toBe(true)
      await expect(gridDates(b)).resolves.toEqual(dates)
    },
  )

  it('jeudi 12 mars 7 h, B passe à 22 h : la date de grille qu’il garde est le 9 mars 8 h', async () => {
    await twoDaysThenNinePm()
    await a.sync()
    await b.sync()

    b.calendar.day = '2026-03-12'
    at('2026-03-12T07:00:00.000Z')
    await b.onClock(() => b.plans.update(id, edition({ times: ['22:00'] })))

    await expect(latest(b)).resolves.toMatchObject({ gridWrittenAt: '2026-03-09T08:00:00.000Z' })
  })
})
