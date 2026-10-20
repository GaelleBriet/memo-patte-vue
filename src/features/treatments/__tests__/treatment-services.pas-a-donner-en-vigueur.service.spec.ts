// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { plain } from './treatment-fixtures'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'
import { treatmentHistory } from '../logic/treatment-history'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import type { Frequency } from '@/shared/domain/dose-calendar'
import { historyEntries } from '@/shared/domain/treatment-reading'

const t = i18n.global.t
const WEEK: Frequency = { value: 1, unit: 'week' }
const TWO_DAYS: Frequency = { value: 2, unit: 'day' }
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

async function luna() {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: '2026-10-06',
    firstDueOn: '2026-10-06',
    gridOriginOn: '2026-10-06',
    endsOn: null,
    frequency: WEEK,
    times: ['09:00'],
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  const walk = { input: { settings: [setting], lines: [], today: '2026-10-20' } }
  await replay.start(walk as unknown as V2Walk, id)
  return id
}

describe('#1006 : « Elles n’étaient pas à donner » écrit des lignes en vigueur (décision du 18 octobre 2026, #952)', () => {
  it('Luna, Milbemax chaque semaine à 9 h depuis le 6 octobre, rien noté ; le 20, tous les 2 jours, « pas à donner » : les 6 et 13 oct. sans « sans effet », fiche et PDF', async () => {
    const id = await luna()
    vi.setSystemTime(new Date(2026, 9, 20, 12))
    await replay.plans.update(id, {
      ...ASKED,
      frequency: TWO_DAYS,
      times: ['09:00'],
      endsOn: null,
      nextDoseOn: null,
      pastDues: 'drop',
    })
    const stored = await storedTreatment(replay.treatments, id)
    const reading = treatmentReadingOf(stored, '2026-10-20')
    const lines = plain(treatmentHistory(t, stored, reading, '2026-10-20')).periods.flatMap(
      (period) => period.lines,
    )
    const answers = lines.filter(({ dose }) => dose.status === 'not-due')

    expect(answers.map(({ kind }) => kind)).toEqual(['not-due', 'not-due'])
    expect(answers.map(({ title }) => title)).toEqual(['13 oct. 2026', '6 oct. 2026'])
    expect(answers.map((line) => 'detail' in line && line.detail)).toEqual([
      'Pas à donner · répondu le 20 oct. 2026',
      'Pas à donner · répondu le 20 oct. 2026',
    ])
    expect(historyEntries(reading.view).map(({ idle }) => idle)).toEqual([false, false])
    expect(reading.view.unloggedDoses).toEqual([])
  })
})
