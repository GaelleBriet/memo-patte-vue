// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createClockedPhone, type ClockedPhone as Phone } from './clocked-phone'

// #904 : lundi 19 octobre 2026, A a 3 jours d'avance, B est à l'heure. B écrit la même ligne entre
// l'envoi de A et son pull : la ligne la plus récente gagne sur les deux téléphones.

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
const clock = { now: 0 }
const at = (instant: string) => {
  clock.now = Date.parse(instant)
}

describe('#904 : une écriture de B entre l’envoi et le pull de A', () => {
  let server: FakeSyncServer
  let a: Phone
  let b: Phone
  let lunaId: string

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
    lunaId = (await b.onClock(() => b.animals.create({ name: 'Luna', species: 'cat' }))).id
    await b.sync()
    await a.sync()
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  const animals = (phone: Phone) => phone.db.query('SELECT * FROM animal ORDER BY id')

  it('B renomme Luna à 8 h 00 min 05 s pendant le cycle de A : A garde « Luna B », comme le serveur', async () => {
    at('2026-10-19T08:00:00.000Z')
    await a.onClock(() => a.animals.update(lunaId, { name: 'Luna A', species: 'cat' }))
    server.beforeNextPull('animal', async () => {
      at('2026-10-19T08:00:05.000Z')
      await b.onClock(() => b.animals.update(lunaId, { name: 'Luna B', species: 'cat' }))
      at('2026-10-19T08:00:06.000Z')
      await b.onClock(() => b.animals.create({ name: 'Milo', species: 'dog' }))
      await b.sync()
    })

    at('2026-10-19T08:00:01.000Z')
    await a.sync()
    at('2026-10-19T09:00:00.000Z')
    await a.sync()
    await b.sync()

    await expect(a.animals.getById(lunaId)).resolves.toMatchObject({ name: 'Luna B' })
    expect(await animals(a)).toEqual(await animals(b))
  })
})
