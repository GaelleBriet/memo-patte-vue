import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseExportFile } from '../logic/parse-export-file'
import { importFixtureJson } from './import-fixture'

type ExportDocument = Record<string, unknown>

const HEURES = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

// Limite de 50 000 échéances (`treatment-reading`) : ce traitement à 24 heures reste lisible jusqu'au 2026-10-23.
function dailyAllHours(): string {
  const document = JSON.parse(importFixtureJson()) as ExportDocument
  const [, period] = document.treatmentPeriods as ExportDocument[]
  Object.assign(period!, {
    startsOn: '2021-02-10',
    firstDueOn: '2021-02-10',
    gridOriginOn: '2021-02-10',
    endsOn: null,
    times: HEURES,
  })
  document.treatmentDoses = (document.treatmentDoses as ExportDocument[]).slice(0, 1)
  return JSON.stringify(document)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('parseExportFile : le jour de l’import est le jour civil local', () => {
  it('à 00 h 30 le lendemain, le traitement est trop long à relire, même si l’UTC est encore la veille', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 24, 0, 30) })

    expect(parseExportFile(dailyAllHours())).toEqual({ ok: false, reason: 'invalid' })
  })

  it('à 23 h 30 le dernier jour lisible, le traitement est accepté, même si l’UTC est déjà le lendemain', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 23, 23, 30) })

    expect(parseExportFile(dailyAllHours()).ok).toBe(true)
  })
})
